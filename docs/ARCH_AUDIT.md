# ARCH_AUDIT — Investigasi Penghapusan Redis/BullMQ → Antrean Postgres Supabase

> Dokumen ini adalah **laporan investigasi read-only** (disimpan dari laporan sebelumnya, 1 Okt 2026).
> Desain tabel `render_jobs` dan fungsinya di bagian 4 menjadi **dasar tugas migrasi
> `supabase/migrations/032_render_queue.sql`**. Target: **biaya $0**, menghapus Redis/Upstash,
> web di Vercel, worker render di PC pemilik 24 jam, data di Supabase free (500 MB DB, 5 GB egress).

## 0. Perbandingan alternatif (semuanya $0, tanpa server baru)

| Opsi | Dependency baru? | Catatan |
|---|---|---|
| **A. Supabase Postgres sebagai antrean (DIPILIH)** | Tidak — `supabase-js` sudah dipakai web & worker | Worker sudah memakai service role (update tabel `projects`) |
| B. Upstash free tetap, ganti BullMQ dengan loop tipis BRPOP | Tidak | Masih membakar kuota (pub/sub + rate-limit); risiko habis lagi |
| C. `pg-boss` | **Ya (perlu izin)** | Semantik queue matang, tetap $0 |
| D. AWS SQS free tier | Ya (SDK+kredensial) | Menambah vendor; progres tetap butuh Supabase |
| E. Redis self-host di PC + tunnel | Tidak | Vercel → PC lewat NAT: tidak stabil, tidak direkomendasikan |
| F. In-memory saja | – | Tidak mungkin (render menit-an > batas serverless) |

## 1. Inventaris pemakai Redis (file:baris) — hasil grep `ioredis|bullmq`

**Web (Vercel):**

| Pemakai | Lokasi | Perintah | Tujuan |
|---|---|---|---|
| Enqueue job | `worker/src/queue.ts:160-166` (`addRenderJob` → `queue.add`) dipanggil `src/app/api/generate-video/route.ts:210` | BullMQ `add` (≈4-8 cmd) | Masuk antrean render |
| Reuse job aktif (REL-06) | `src/app/api/generate-video/route.ts:36-51` (`queue.getJobs` baris 39), dipakai `:160-166` | multi READ (≈3-6 cmd) | Pakai ulang job hidup <15 menit (`src/lib/pipeline/render-job-reuse.ts:19,43-62`) |
| Progres SSE | `src/app/api/video-progress/route.ts:19,24,29-39,74,103,120` | `SUBSCRIBE/UNSUBSCRIBE` | Forward event `progress:{projectId}` dari worker |
| Rate limit (sliding window) | `src/lib/rate-limit.ts:31` klien; `:174 ZADD`, `:175 ZREMRANGEBYSCORE`, `:176 ZCARD`, `:177 EXPIRE`, `:199 ZREM`, `:211 ZRANGE` | 5-6 cmd per cek | 7 route: footage `:28/:30`, generate-script `:28,54,97,195`, generate-subtitle `:211`, generate-tts `:281`, generate-video `:195`, ideas `:164`; fallback in-memory `:69-99` |
| Preview premium 1×/device | `src/lib/preview-guard.ts:14-24` (klien), `:32 GET`, `:44 SET` tanpa TTL; pemanggil `generate-tts/route.ts:84,237` | GET/SET | Enforce 1× preview TTS premium |
| Env wajib | `src/lib/env.ts:18,79`; `.env.example:45-47` | – | `REDIS_URL` wajib saat import |
| Test mock | `src/lib/__tests__/rate-limit-redis.test.ts:18,21` | mock | – |

**Worker (PC pemilik):**

| Pemakai | Lokasi | Perintah |
|---|---|---|
| BullMQ Worker | `worker/src/index.ts:38-121` (koneksi `:113`, concurrency `:114`, limiter 1/1000ms `:116-119`), `job.updateProgress` `:53` | blocking pop + state + HSET |
| Koneksi/antrean | `worker/src/queue.ts:111-127` (`maxRetriesPerRequest:null`), `:134-155` (`attempts:2` `:139`, backoff eksponensial 5 s `:140-143`, `removeOnComplete` 24 jam/1000 `:144-147`, `removeOnFail` 7 hari `:148-151`), `:180-189` `closeQueue` | – |
| Publish progres | `worker/src/queue.ts:171-177` (`PUBLISH`); pemanggil `worker/src/index.ts:48,57,75,107` | `PUBLISH` ±0,5-2/detik saat render |
| Env keras | `worker/src/index.ts:24-27`; `worker/.env.example:9` | throw tanpa `REDIS_URL` |

**Estimasi konsumsi (analitis/STATIS, tidak diukur):** budget Upstash = 500.000 cmd/bulan = ±16.667/hari.
BullMQ idle tetap loop (scan job tertunda tiap ±1 dtk + blocking pop) ≈ 5-15 cmd/dtk = 400.000-1.300.000/hari → penyebab utama kuota habis. Rate-limit ≈ 16.500 cmd/hari ≈ 495.000/bulan (porsi kedua).

## 2. Desain tabel & fungsi (dasar migrasi 032)

**Tabel `render_jobs`** — PK `text id` berformat persis `render:<projectId>:<ts>` (kompatibel filter `jobId` klien), `project_id`, `identity_key`, `user_id uuid`, `payload jsonb` (RenderJobData), `status` check `queued|active|done|failed|canceled`, `progress`, `error`, `attempts`, `max_attempts` (default **2** = BullMQ `attempts:2`), `available_at` (slot retry/backoff), `locked_by/locked_at/lease_expires_at/heartbeat_at` (lease 90 dtk), `created_at/updated_at/finished_at`. Indeks parsial: klaim (`available_at where queued`), lease (`lease_expires_at where active`), reuse (`project_id,created_at desc where queued|active`), proyek, cleanup (`finished_at`).

**Tabel `render_workers`** — `id` (hostname:pid), `label`, `backend`, `last_seen_at` → tanda hidup worker; web menolak enqueue bila `now()-last_seen_at > 45 dtk` (`503 RENDERER_OFFLINE`).

**Fungsi (SECURITY DEFINER, hanya `service_role`):**
- `claim_render_job(worker, lease=90)` → `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1` atas kandidat `(status=queued AND available_at<=now()) OR (status=active AND lease_expires_at<now())`. Job stale yang `attempts>=max_attempts` → **failed dan TIDAK dikembalikan sebagai pekerjaan**; job stale yang masih boleh diulang → dikembalikan ke `queued` lalu kandidat berikutnya diproses; klaim sukses = `attempts+1`, set lease+heartbeat.
- `heartbeat_render_job(id, worker, progress?)` → perpanjang lease + naikkan progress (hanya bila `locked_by` cocok).
- `complete_render_job(id, worker)` → `done`, `progress=100`, `finished_at`.
- `fail_render_job(id, worker, error, base=5)` → bila `attempts<max_attempts`: `queued` + `available_at = now() + 5s×2^(attempts-1)` (**5 s lalu 10 s**), selain itu `failed`.
- `pick_pending_jobs(project_id?, limit=100)` → job `queued|active` <15 menit (sumber data guard reuse).
- `cleanup_render_jobs(retention_days=7)` → hapus selesai >7 hari; `queued` >24 jam → `failed`.

**Keamanan:** RLS aktif; `REVOKE ALL` dari `anon`/`authenticated`, `GRANT SELECT` saja ke `authenticated` dengan policy `user_id = auth.uid()` (baca milik sendiri); tanpa policy INSERT/UPDATE/DELETE → client tidak bisa menulis; fungsi `REVOKE EXECUTE` dari `public, anon, authenticated` + `GRANT EXECUTE` hanya `service_role`. `render_jobs` masuk publication `supabase_realtime` untuk progres.

## 3. Progres ke browser & kuota Supabase (dokumen resmi diakses 1 Okt 2026)

| Opsi | Kueri/user/detik | Keterangan |
|---|---|---|
| Polling 1 dtk | 1 | Egress bisa puluhan GB/bulan pada beban ekstrem → meledak 5 GB |
| Polling 2 dtk | 0,5 | Realistis ±0,4-4 GB/bulan → **cadangan (fallback)** |
| **Supabase Realtime (`postgres_changes`)** | **0** | **Dipilih**: push saat UPDATE, tanpa kueri per detik |

**Batas Free (dikutip dari halaman resmi):** pricing — DB **500 MB**, egress **5 GB**, cached egress 5 GB, storage 1 GB, **50.000 MAU**, **"Unlimited API requests"**, shared CPU **500 MB RAM**, **2 proyek aktif**, proyek free **di-pause setelah 1 minggu inaktivitas**; compute Nano — **Max DB Connections 60**, **pooler 200 klien**; Realtime Free — **200 koneksi bersamaan**, **100 pesan/detik**, **100 channel join/detik**, 100 channel/koneksi, broadcast 256 KB.

**TIDAK PASTI:** batas req/dtk PostgREST free (halaman docs `platform/limits` & `platform/rate-limits` **404** saat diakses); apakah trafik Realtime dihitung ke 5 GB egress; apakah tulisan worker menahan pause "1 minggu inaktivitas".

**Dampak ~100 user/bulan (STATIS):** ±72K kueri antrean/bulan; `render_jobs` ±10-20 MB (retensi 7 hari) dari 500 MB; koneksi jauh di bawah 60/200; progres ≤1 update/dtk → egress ±0,2-0,6 GB/bulan.

## 4. Worker: loop adaptif, tanda hidup, kegagalan

- Loop: klaim tiap **500 ms** saat sibuk; idle mundur **1→2→4→8→maks 10 dtk**. Latensi mulai render: rata-rata ±5 dtk, maks ±10 dtk saat idle (STATIS). Kuota: ±8.640 klaim/hari + heartbeat tiap 15 dtk → <100 MB egress/bulan.
- Heartbeat: `render_workers.last_seen_at` tiap 15 dtk; web menampilkan **"Server render sedang offline"** bila >45 dtk (angka STATIS).
- **PC mati di tengah render** (hari ini): job tetap `active` di BullMQ, guard reuse bisa memakai job mati hingga jendela 15 menit; klien berhenti via watchdog (30/120 dtk) + total 15 menit. **Dengan desain baru**: lease 90 dtk kedaluwarsa → job kembali `queued` (diambil ulang), bila `attempts>=max_attempts` → `failed`; `queued` >24 jam → `failed` oleh cleanup.
- **Dua worker bersamaan**: `FOR UPDATE SKIP LOCKED` → satu-satunya pemenang per baris; `locked_by` dicek di heartbeat/complete/fail → update oleh worker asing mengembalikan `false` (tanpa korupsi).

## 5. Kompatibilitas & flag

`QUEUE_BACKEND=redis|supabase` (default `redis` untuk rollback cepat) di web & worker; `REDIS_URL` jadi opsional saat `supabase`. Dipertahankan tanpa perubahan: guard reuse (hanya ganti sumber data `listPendingRenderJobs`), filter `msg.jobId` klien (format id sama), watchdog fase (asal heartbeat progress ≤15 dtk), resume `errorStep` (murni klien), retry 2× + backoff 5 s, pola pesan `error` per kegagalan.

## 6. Pembatas kuota → Supabase

Pindah ke fungsi atomik `rate_limit_check(key,max,window_ms)` di Supabase (sliding window per baris), **bukan** in-memory (per-instance Vercel → limit jadi ~5× lebih lunak), **bukan** dipertahankan di Redis (±495K cmd/bulan ≈ seluruh kuota 500K). Preview-guard → tabel `preview_grants` (`INSERT … ON CONFLICT DO NOTHING`). **Batas harian tidak berubah**: script 20, TTS 10, video 5, footage 20/mnt, ideas 5/mnt, subtitle 10/mnt, trial anon 3/hari (`src/lib/rate-limit-config.ts:16-29`). Dampak: +30-150 ms per cek.

## 7. Rencana bertahap (estimasi jam, STATIS)

0 flag `QUEUE_BACKEND` (2 jam) → 1 skema+RPC (4) → 2 worker loop+heartbeat+job sintetis (8) → 3 web enqueue+reuse+offline check (6) → 4 progres Realtime+fallback polling (6) → 5 rate-limit/pindah preview-guard (4) → 6 uji sintetis+chaos 2 worker+kill (6) → 7 flip produksi+monitor (2+monitoring). **Total ±38-46 jam.** Rollback: balik flag ke `redis` (tabel SQL ditinggalkan aman). Uji tanpa kuota render: `payload.__synthetic` (lewati FFmpeg) atau `audioUrl` rusak (gagal cepat). Pola eksekusi SQL aman: jalankan per blok/statement (idempoten `if not exists`), RLS terakhir, verifikasi tiap blok — jangan satu transaksi lintas semua statement.

## 8. Kepatuhan laporan ini

Read-only: tidak ada file kode diubah kecuali dokumen ini, tidak ada migrasi dijalankan ke produksi, tidak ada dependency dipasang, `REDIS_URL` produksi tidak dipakai. **Dependency yang diajukan: tidak ada yang wajib** (opsional `pg-boss`, menunggu izin). Seluruh angka konsumsi/kuota/estimasi jam ditandai **STATIS**.

