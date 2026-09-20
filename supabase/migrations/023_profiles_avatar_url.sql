-- Faza Studio Database Schema - Migration 023 (OAuth avatar sync)
-- Tambah kolom avatar_url di profiles untuk menyimpan avatar dari user_metadata (Google OAuth).
alter table profiles
  add column if not exists avatar_url text;
