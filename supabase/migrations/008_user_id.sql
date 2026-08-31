-- ViraLoop Database Schema — Migration 008 (ACS)
-- Kolom user_id pada projects & user_usage untuk mengklaim data anon -> akun.
--
-- Alur konversi: user generate anonim (identity_key = 'anon:<device_id>').
-- Saat login, kita pindahkan kepemilikan proyek/usage tsb ke akun
-- (user_id = auth.users.id). identity_key tetap tersimpan untuk kompatibilitas.

alter table projects
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table user_usage
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_projects_user_id
  on projects (user_id);

create index if not exists idx_user_usage_user_id
  on user_usage (user_id);