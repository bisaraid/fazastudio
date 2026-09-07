-- Migration 015 — Admin role pada profiles
-- ============================================================
-- Admin dashboard menggunakan AKUN TERDAFTAR (Supabase Auth),
-- bukan shared secret (ADMIN_SECRET). Setiap user punya flag
-- is_admin di profiles (user_id → auth.users.id).
--
-- Bootstrap: env ADMIN_EMAILS (comma-separated) menentukan email
-- yang diizinkan; route admin meng-auto-promote is_admin=true
-- saat user dengan email tsb login pertama kali.

alter table profiles
  add column if not exists is_admin boolean not null default false;