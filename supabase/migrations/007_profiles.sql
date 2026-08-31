-- ViraLoop Database Schema — Migration 007 (ACS)
-- Tabel profiles untuk onboarding & preferensi user yang login (auth).
--
-- Menghubungkan biografi user (Supabase Auth: auth.users) dengan preferensi
-- konten (genre/platform) yang dipilih saat /mulai. Dipakai juga sebagai
-- penanda apakah user sudah selesai onboarding.
--
-- NOTE: identitas anon tetap memakai identity_key di projects/user_usage.
-- Kolom user_id di projects/user_usage ditambahkan di migration claim (Fase 3).

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  genre_tags text[] default '{}',
  platform_tags text[] default '{}',
  has_completed_onboarding boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========================
-- RLS (Row Level Security)
-- ========================
alter table profiles enable row level security;

-- User public-bisa-baca (dibutuhkan untuk read via service role; policy ini
-- opsional namun menjaga konsistensi pola public-read seperti tabel lain).
drop policy if exists "Public read profiles" on profiles;
create policy "Public read profiles"
  on profiles
  for select
  using (true);

-- NOTE: INSERT/UPDATE via service role (bypass RLS) di /api/profile.
-- Tidak ada policy write untuk anon key → data profil tak bisa dimodifikasi
-- langsung dari client.