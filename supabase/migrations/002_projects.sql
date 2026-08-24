-- ViraLoop Database Schema — Migration 002 (ACS)
-- Tabel projects untuk menyimpan project ACS secara real

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