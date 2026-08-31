-- Migration 013: Content Categories Mandiri + Drop Tabel ViraLoop
--
-- TUJUAN: Faza Studio TIDAK LAGI bergantung ke tabel viraLoop.
-- 1. CREATE content_categories (skema Faza Studio, bukan viraLoop)
-- 2. SEED 9 kategori dari src/lib/categories/index.ts
-- 3. DROP semua tabel viraLoop yang tidak dipakai

-- ============================================================
-- 1. CREATE content_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS content_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index untuk lookup by slug (dipakai di banyak query)
CREATE INDEX IF NOT EXISTS idx_content_categories_slug
  ON content_categories (slug);

-- RLS: public read (konsisten dengan tabel Faza Studio lainnya)
ALTER TABLE content_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read content_categories" ON content_categories;
CREATE POLICY "Public read content_categories"
  ON content_categories
  FOR SELECT
  USING (true);

-- ============================================================
-- 2. SEED 9 kategori dari src/lib/categories/index.ts
--    Idempoten & aman meski tabel sudah berisi dari viraLoop.
-- ============================================================
INSERT INTO content_categories (slug, name)
SELECT v.slug, v.name
FROM (VALUES
  ('horror', 'Horror'),
  ('misteri', 'Misteri & Fenomena Tak Terpecahkan'),
  ('psikologi', 'Psikologi'),
  ('romance', 'Romance & Relationship'),
  ('motivasi', 'Motivasi & Kehidupan'),
  ('edukasi', 'Edukasi & Tips Harian'),
  ('affiliate', 'Affiliate & Review'),
  ('sejarah', 'Sejarah & Fakta Seru'),
  ('keuangan', 'Uang & Investasi')
) AS v(slug, name)
WHERE NOT EXISTS (SELECT 1 FROM content_categories c WHERE c.slug = v.slug);

create table if not exists script_generations (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references content_categories(id),
  user_input text,
  hook_pattern_used text,
  final_script text,
  llm_provider text default 'groq',
  created_at timestamptz default now()
);

create index if not exists idx_script_generations_category
  on script_generations (category_id, created_at desc);

alter table script_generations enable row level security;

drop policy if exists "Service role full access script_generations" on script_generations;
create policy "Service role full access script_generations"
  on script_generations
  for all
  using (true)
  with check (true);

-- ============================================================
-- 3. Storage buckets Faza Studio (agar setup dari nol lengkap)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('acs-audio', 'acs-audio', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('acs-subtitles', 'acs-subtitles', true)
on conflict (id) do nothing;

-- ============================================================
-- 4. DROP tabel viraLoop
-- ============================================================
DROP TABLE IF EXISTS pattern_insights;
DROP TABLE IF EXISTS trending_suggestions;
DROP TABLE IF EXISTS usage_history;
DROP TABLE IF EXISTS trend_signals;
