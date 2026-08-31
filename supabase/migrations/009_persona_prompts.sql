-- ViraLoop Database Schema — Migration 009 (ACS)
-- Sistem personalisasi onboarding Faza Studio (REVISI: SEMUA 4 LAYER WAJIB).
--
-- 1. Tabel persona_prompts: menyimpan prompt persona untuk kombinasi
--    Layer 1 (mode) + Layer 2 (niche) + Layer 3 (gaya) + Layer 4 (cara cerita).
--    TIDAK ada konsep "default" — semua kombinasi harus terisi penuh.
-- 2. Kolom Layer 1-4 pada tabel profiles untuk menyimpan pilihan onboarding user
--    (semua wajib setelah /mulai selesai).

create table if not exists persona_prompts (
  id uuid primary key default gen_random_uuid(),
  -- Layer 1: 'jualan' | 'konten'
  mode text not null,
  -- Layer 2: slug niche ('skincare','mistis',...)
  niche_slug text not null,
  -- Layer 3: slug gaya ngomong
  gaya_key text not null,
  -- Layer 4: slug cara cerita
  cerita_key text not null,
  prompt text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Setiap kombinasi (mode, niche, gaya, cerita) hanya muncul sekali — unik.
-- Drop & recreate PENTING: versi lama membuat index berbasis ekspresi
-- (coalesce) yang TIDAK bisa dipakai ON CONFLICT (kolom). Buang dulu agar
-- selalu jadi unique index polos atas kolom yang sama.
drop index if exists uq_persona_prompts_combo;
create unique index uq_persona_prompts_combo
  on persona_prompts (mode, niche_slug, gaya_key, cerita_key);

-- Index lookup kombinasi saat generate.
create index if not exists idx_persona_prompts_lookup
  on persona_prompts (mode, niche_slug, gaya_key, cerita_key);

-- ========================
-- RLS (Row Level Security)
-- ========================
alter table persona_prompts enable row level security;

-- Public read (dibutuhkan biar fitur frontend bisa baca daftar opsi/gaya).
drop policy if exists "Public read persona_prompts" on persona_prompts;
create policy "Public read persona_prompts"
  on persona_prompts
  for select
  using (true);

-- Write/seed via service role (bypass RLS) di seed script / admin.

-- ============================================================
-- Kolom Layer 1-4 pada profiles
-- ============================================================
alter table profiles
  add column if not exists layer1_mode text,          -- 'jualan' | 'konten'
  add column if not exists niche_slug text,           -- slug Niche (Layer 2)
  add column if not exists gaya_key text,             -- slug Gaya (Layer 3)
  add column if not exists cerita_key text;           -- slug Cara Cerita (Layer 4)