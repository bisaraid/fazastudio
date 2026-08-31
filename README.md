# AutoContent Studio (Faza Studio)

Sistem pembuatan konten video otomatis: script → audio → subtitle → video.

## Sistem Trend (Cron Job)

Data topik yang "lagi banyak dicari" diambil dari **YouTube Data API v3** (region Indonesia),
di-scoring, dan disimpan ke tabel `trend_ideas` di Supabase. Endpoint `/api/ideas` membaca
data ini (bukan fetch langsung saat user buka halaman), jadi tampil instan tanpa loading.

> Catatan: project Supabase dipakai bersama viraLoop yang punya tabel `trend_signals` sendiri.
> ACS memakai nama tabel terpisah `trend_ideas` agar tidak bentrok dengan schema crawler viraLoop.

### Sumber data (berurutan)
1. **Primary — YouTube Data API v3** (`YOUTUBE_API_KEY`): video trending Indonesia per
   niche (via `videoCategoryId`). Data: judul, views, likes, upload date.
2. **Enrichment — Google Trends**: opsional, bila YouTube kurang menutup suatu niche.
3. **Fallback — AI (Groq)**: hanya bila YouTube & cache kosong. Label di UI dibedakan
   ("Saran topik dari AI") agar user tidak tertipu bahwa itu data trending nyata.

### Cron job (`/api/cron/trends`)
Menjalankan pengambilan + scoring + simpan untuk **12 niche** setiap **6 jam**.

#### Jika deploy di Vercel
Cron otomatis terdaftar lewat `vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/trends", "schedule": "0 */6 * * *" }] }
```
Set env `CRON_SECRET` di Vercel Dashboard (berbeda dari `API_SECRET_KEY`). Vercel akan
menyertakan header sesuai konfigurasi; endpoint memvalidasi `Authorization: Bearer CRON_SECRET`
(selain itu → `401`).

#### Jika deploy di platform lain (bukan Vercel)
Jadwalkan panggilan HTTP ke endpoint ini setiap 6 jam, misal:
- **crontab (Linux server / VPS):**
  ```cron
  0 */6 * * * curl -s -X GET https://your-domain.com/api/cron/trends -H "Authorization: Bearer $CRON_SECRET"
  ```
- **GitHub Actions** (workflow `.github/workflows/trends-cron.yml` dengan jadwal cron 6 jam) —
  panggil endpoint di atas dengan header Authorization.
- **Supabase Cron / pg_cron** tidak cocok untuk HTTP eksternal; gunakan salah satu cara di atas.

Pastikan `CRON_SECRET` di-set di environment deployment dan nilainya sama dengan yang dipakai
di header panggilan cron.

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
