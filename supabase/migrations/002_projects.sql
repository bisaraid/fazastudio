-- ViraLoop Database Schema — Migration 002 (ACS)
-- Tabel projects untuk menyimpan project ACS secara real
--
-- content_categories dibuat DI SINI (bukan hanya di 013) karena projects
-- punya FK ke content_categories. Agar Faza Studio bisa setup dari nol
-- dengan menjalankan migrations saja, tabel kategori HARUS ada lebih dulu.
-- Seed lengkap ada di migration 013_independent_content_categories.sql.

-- ========================
-- content_categories (mandiri Faza Studio)
-- ========================
create table if not exists content_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz default now()
);

create index if not exists idx_content_categories_slug
  on content_categories (slug);

alter table content_categories enable row level security;

drop policy if exists "Public read content_categories" on content_categories;
create policy "Public read content_categories"
  on content_categories
  for select
  using (true);

-- Seed 9 kategori dari src/lib/categories/index.ts (idempoten).
-- Pakai WHERE NOT EXISTS (bukan ON CONFLICT slug) agar aman di DB yang
-- content_categories-nya sudah ada dari viraLoop namun slug-nya belum
-- tentu punya unique constraint/index.
insert into content_categories (slug, name)
select v.slug, v.name
from (values
  ('horror', 'Horror'),
  ('misteri', 'Misteri & Fenomena Tak Terpecahkan'),
  ('psikologi', 'Psikologi'),
  ('romance', 'Romance & Relationship'),
  ('motivasi', 'Motivasi & Kehidupan'),
  ('edukasi', 'Edukasi & Tips Harian'),
  ('affiliate', 'Affiliate & Review'),
  ('sejarah', 'Sejarah & Fakta Seru'),
  ('keuangan', 'Uang & Investasi')
) as v(slug, name)
where not exists (select 1 from content_categories c where c.slug = v.slug);

-- ========================
-- projects
-- ========================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null,
  title text,
  category_id uuid references content_categories(id),
  status text default 'draft',
  script text,
  audio_url text,
  subtitle_url text,
  video_url text,
  hook_pattern text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_projects_identity_created
  on projects (identity_key, created_at desc);

-- ========================
-- RLS (Row Level Security)
-- ========================

alter table projects enable row level security;

-- Policy: PUBLIC READ — siapa saja bisa baca (dibutuhkan untuk list project)
drop policy if exists "Public read projects" on projects;
create policy "Public read projects"
  on projects
  for select
  using (true);

-- NOTE:
-- - SELECT: anon key bisa karena ada policy "for select using (true)"
-- - INSERT/UPDATE/DELETE: anon key DITOLAK karena tidak ada policy untuk operasi tsb
-- - Service role key: tetap bisa write karena bypass RLS sepenuhnya