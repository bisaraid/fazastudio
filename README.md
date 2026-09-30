# Faza Studio

Sistem pembuatan konten video otomatis: script → audio → subtitle → video.

## Sistem Trend (Cron Job)

Data topik yang "lagi banyak dicari" diambil dari **YouTube Data API v3** (region Indonesia),
di-scoring, dan disimpan ke tabel `trend_ideas` di Supabase. Endpoint `/api/ideas` membaca
data ini (bukan fetch langsung saat user buka halaman), jadi tampil instan tanpa loading.

> Catatan: Faza Studio memakai nama tabel sendiri (`trend_ideas` dan `script_generations`) agar skema data tetap mandiri.

### Sumber data (berurutan)
1. **Primary — YouTube Data API v3** (`YOUTUBE_API_KEY`): video trending Indonesia per
   niche (via `videoCategoryId`). Data: judul, views, likes, upload date. **Timestamp**
   disimpan `source: "youtube"`.
2. **Early-signal — YouTube US harvest** (`source: "youtube_us"`): video trending USA per
   niche (region `US`, category sama), judul diterjemahkan ke Bahasa Indonesia (via Groq)
   sebelum disimpan. Jadi sinyal awal "akan trending" sebelum tren masuk pasar Indonesia.
3. **Enrichment — Google Trends**: opsional, bila YouTube kurang menutup suatu niche.
4. **Fallback — AI (Groq)**: hanya bila YouTube & cache kosong. Label di UI dibedakan
   ("Saran topik dari AI") agar user tidak tertipu bahwa itu data trending nyata.

### Dua sinyal trend
- **Trending sekarang** (`/api/ideas?signal=now` — default): `source:"youtube"`, score tinggi,
  plus `velocity`/`trend_direction` (up/stable/down) dari perbandingan score hari ini vs kemarin.
- **Akan trending** (`/api/ideas?signal=upcoming`): `source:"youtube_us"` yang belum muncul
  di keyword `youtube` niche yang sama (match normalisasi).

### Personalized Suggest (`/api/suggest`)
Gabungan behavior user + trend intelligence, dipakai homepage & editor:
- **Niche authoritative** = `profile.niche_slug`; `projects` hanya sebagai sinyal recency.
- **Sinyal** dipilih dari pola behavior: regenerasi tinggi (regen ≥ 3 & ≥ 2×lanjut) → bias
  **"akan trending"** (US); normal/lanjut dominan → **"tren sekarang"** (ID).
- **Preferensi** (provider/platform/durasi) dikembalikan sebagai *metadata* — tidak mengubah ranking.
- **Fallback**: user baru / anonim / tanpa profil → suggest global (`personalized:false`,
  `source:"global"`).
- Response: `{ personalized, signal, source, niches, ideas[] }`.

### Cron job (`/api/cron/trends`)
Menjalankan pengambilan + scoring + simpan untuk **12 niche** setiap **6 jam**
(00:00, 06:00, 12:00, 18:00 UTC — 4× sehari).

#### Cron di-handle GitHub Actions
Scheduling **tidak lagi** memakai `vercel.json` (Vercel plan Hobby hanya mengizinkan
cron 1×/hari). Cron dijalankan oleh workflow **`.github/workflows/cron-trends.yml`**
yang memanggil endpoint produksi dengan header auth:

```yaml
on:
  schedule:
    - cron: "0 */6 * * *"   # 00:00, 06:00, 12:00, 18:00 UTC
  workflow_dispatch:          # trigger manual dari tab Actions
```

#### Setup `CRON_SECRET` di GitHub Secrets
Endpoint `/api/cron/trends` memvalidasi `Authorization: Bearer CRON_SECRET`
(selain itu → `401`). Workflow membaca secret ini dari GitHub, jadi wajib di-setup:

1. Buka repo di GitHub → **Settings → Secrets and variables → Actions**.
2. Klik **New repository secret**.
3. Name: `CRON_SECRET` — Secret: nilai sama dengan env `CRON_SECRET` yang ada di
   Vercel (Project → Settings → Environment Variables).
4. Save. Workflow akan otomatis memakainya via `${{ secrets.CRON_SECRET }}`.

> Pastikan `CRON_SECRET` juga tetap ter-set di Vercel — endpoint membaca
> `process.env.CRON_SECRET` saat runtime untuk mencocokkan header.

#### Trigger manual
Workflow punya `workflow_dispatch`, jadi bisa dijalankan kapan saja dari tab
**Actions → cron-trends → Run workflow** tanpa menunggu jadwal.

#### Jika deploy di platform lain (bukan Vercel + GitHub)
Jadwalkan panggilan HTTP ke endpoint ini setiap 6 jam, misal via **crontab
(Linux server / VPS)**:
```cron
0 */6 * * * curl -s -X GET https://your-domain.com/api/cron/trends -H "Authorization: Bearer $CRON_SECRET"
```
Pastikan `CRON_SECRET` di-set di environment deployment dan nilainya sama dengan
yang dipakai di header panggilan cron.

### Tabel DB
- Migration: `supabase/migrations/012_trend_ideas.sql` (membuat tabel `trend_ideas`)
- Kolom utama: `keyword`, `niche_slug`, `source`, `score`, `score_breakdown`, metadata YouTube,
  `fetched_at`.

## Behavior Tracking
Sinyal perilaku user (tombol "Ulangi Script/Audio", "Lanjut ke Audio langsung", "Ganti Durasi")
dicatat ke tabel `behavior_events` (fire-and-forget). `resolvePersona()` membaca 30 hari data
ini untuk menyesuaikan output script (aturan ringan, non-ML).

## Profil & Onboarding
Profil 4 layer (tujuan → niche → gaya → cara cerita) disimpan di tabel `profiles`. Halaman
buat konten membaca profil untuk menyesuaikan sapaan, placeholder, genre, platform & durasi
default. User yang belum menyelesaikan onboarding diarahkan ke `/mulai`.

## Proyek Admin (ringkasan)

Panel di `/admin` — akses butuh role admin (migration `015_admin_role.sql`).

### Fitur
- **Overview** (`/admin/overview`): chart pertumbuhan harian (users, projects, scripts,
  trends, paid), badge delta% real-time, dan activity feed gabungan (audit log + proyek
  terbaru).
- **Users**: cari user, ubah plan (`set_plan`) dan akses admin (`set_admin`).
- **Transaksi**: monitor pembayaran & atur plan user.
- **Trending**: picu harvest tren manual (`trigger_trends`).
- Aksi sensitif dicatat ke audit log via `src/lib/admin-audit.ts` (email subjek
  di-redaksi dari sisi lib). API: `/api/admin/metrics` (defensif: tabel belum ada →
  tetap 200 + `tableReady:false`) dan `/api/admin/activity`.

### Tabel baru
- **`admin_metrics_daily`** — migration `026_admin_metrics_daily.sql`: snapshot harian
  metrik (PK `date`; `total_users`, `total_projects`, `total_scripts`, `total_trends`,
  `paid_users`, `is_estimated`). RLS aktif tanpa policy → hanya service role (server-side).
  Snapshot hari ini di-upsert oleh `recordAdminMetricsDay()` (`src/lib/admin-snapshot.ts`).
- **`admin_audit_logs`** — migration `027_admin_audit_logs.sql`: aksi admin
  (`set_plan` | `set_admin` | `trigger_trends`), `payload` jsonb, index
  `(created_at desc)`. RLS aktif tanpa policy.

### Backfill (sekali, idempoten)
Jalankan migration 026 & 027 dulu (SQL editor Supabase / `supabase db push`), lalu:

```bash
npx tsx scripts/backfill-admin-metrics.ts --dry-run   # cek rentang, tanpa tulis
npx tsx scripts/backfill-admin-metrics.ts             # tulis 30 hari (is_estimated=true)
```

Butuh env `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Baris hasil backfill
ditandai `is_estimated` (data yang sudah dihapus tidak terhitung → digambar putus-putus
di chart).

### Menjalankan test
```bash
npx vitest run        # seluruh suite (admin-*, claim, midtrans, persona, …)
npx tsc --noEmit      # type-check
```
Detail harness (Vitest 3, `vi.mock`, fix drive-letter Windows) ada di `TESTING.md`.
