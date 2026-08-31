-- Migration 012: Tabel trend_ideas untuk menyimpan data trend dari YouTube & Google Trends
-- Dipakai sistem /api/ideas untuk menampilkan rekomendasi topik ke user.
--
-- CATATAN PENTING: Project Supabase ini dipakai BERSAMA project viraLoop, dan tabel
-- `trend_signals` SUDAH ADA di sana dengan skema milik crawler viraLoop (produk/affiliate).
-- Untuk menghindari bentrok/merusak data crawler tersebut, ACS memakai NAMA TABEL SENDIRI
-- (trend_ideas), bukan menabrak `trend_signals`.

create table if not exists trend_ideas (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  niche_slug text not null,
  source text not null default 'youtube', -- 'youtube' | 'google_trends' | 'ai_fallback'

  -- Data mentah dari sumber
  score numeric not null default 0,
  score_breakdown jsonb not null default CAST('{}' AS jsonb), -- { momentum, relevance, recency }

  -- Metadata YouTube (null kalau sumber bukan youtube)
  youtube_video_id text,
  youtube_title text,
  youtube_channel text,
  youtube_views bigint default 0,
  youtube_likes bigint default 0,
  youtube_uploaded_at timestamptz,

  -- Status
  fetched_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),

  -- Unique constraint: satu keyword per niche per source per fetch cycle
  -- (lihat unique index di bawah)
  created_at timestamptz default now()
);

-- Index untuk query cepat: top trend per niche, terbaru dulu
create index if not exists idx_trend_ideas_niche_score
  on trend_ideas (niche_slug, score desc, fetched_at desc);

create index if not exists idx_trend_ideas_fetched
  on trend_ideas (fetched_at desc);

-- Unique: satu keyword hanya muncul sekali per niche per hari per source
-- (menghindari duplikat saat cron jalan berkala)
-- NOTE: date(fetched_at) pada timestamptz bersifat STABLE (ikut timezone
-- session) → DILARANG di ekspresi index. Pakai (fetched_at AT TIME ZONE 'UTC')
-- agar ekspresinya IMMUTABLE. Gunakan CAST(... AS date) (bukan ::) agar
-- kompatibel dengan runner/parser SQL yang tidak menerima operator '::'.
-- Drop dulu index lama (definisi date() yang STABLE) agar selalu ter-recreate.
drop index if exists idx_trend_ideas_unique_daily;
create unique index idx_trend_ideas_unique_daily
  on trend_ideas (keyword, niche_slug, source, CAST((fetched_at AT TIME ZONE 'UTC') AS date));

-- ========================
-- RLS
-- ========================
alter table trend_ideas enable row level security;

-- Hanya service role yang bisa menulis/membaca (via API route)
-- Tidak ada akses publik langsung (semua via /api/ideas)
drop policy if exists "Service role full access" on trend_ideas;
create policy "Service role full access"
  on trend_ideas
  for all
  using (true)
  with check (true);
