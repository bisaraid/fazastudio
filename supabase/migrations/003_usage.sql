-- ViraLoop Database Schema — Migration 003 (ACS)
-- Tabel user_usage untuk menyimpan credit/plan per identity per periode (bulan).
-- 
-- Pola: satu baris per (identity_key, period). period = bulan (YYYY-MM).
-- Plan default 'free' dengan credits_total = 10 (sesuai pilihan audit / Free plan).
-- 
-- identity_key = 'anon:<ip>' untuk MVP (belum integrasi cookie/auth penuh).
 
create table if not exists user_usage (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null,
  period text not null,          -- e.g. '2026-08'
  plan text default 'free',      -- 'free' | 'starter' | 'pro'
  credits_total int default 10,  -- free = 10 kredit per bulan
  credits_used int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Satu baris unik per identity per periode bulan
create unique index if not exists uq_user_usage_identity_period
  on user_usage (identity_key, period);

-- Index lookup per identity untuk dashboard/usage
create index if not exists idx_user_usage_identity
  on user_usage (identity_key);

-- ========================
-- RLS (Row Level Security)
-- ========================

alter table user_usage enable row level security;

-- Policy: PUBLIC READ — siapa saja bisa baca (dibutuhkan untuk list usage)
drop policy if exists "Public read user_usage" on user_usage;
create policy "Public read user_usage"
  on user_usage
  for select
  using (true);

-- NOTE:
-- - SELECT: anon key bisa karena ada policy "for select using (true)"
-- - INSERT/UPDATE/DELETE: anon key DITOLAK karena tidak ada policy utk operasi tsb
-- - Service role key: tetap bisa write karena bypass RLS sepenuhnya