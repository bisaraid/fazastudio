-- Faza Studio Database Schema — Migration 016 (ACS)
-- ============================================================
-- Ganti policy baca-publik menjadi baca-data-sendiri (own-data).
-- Berlaku untuk tabel: projects, user_usage, profiles.
--
-- KEBIJAKAN LAMA: "Public read ..." SELECT using (true) — siapa pun bisa baca semua baris.

-- KEBIJAKAN BARU: user hanya bisa membaca baris miliknya sendiri (auth.uid() = user_id).
-- Seluruh operasi baca aplikasi memakai service-role (bypass RLS) — jadi kebijakan
-- baru ini hanya mengunci akses langsung klien (anon/authenticated key).
-- ============================================================

drop policy if exists "Public read projects" on projects;
drop policy if exists "Public read user_usage" on user_usage;
drop policy if exists "Public read profiles" on profiles;

create policy "Users read own projects"
  on projects
  for select
  using (auth.uid() = user_id);

create policy "Users read own user_usage"
  on user_usage
  for select
  using (auth.uid() = user_id);

create policy "Users read own profiles"
  on profiles
  for select
  using (auth.uid() = user_id);