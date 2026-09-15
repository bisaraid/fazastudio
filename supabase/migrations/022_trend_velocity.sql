-- Faza Studio Database Schema — Migration 022 (Trend Pattern Engine)
-- Tambah kolom velocity untuk mendeteksi arah tren ("sedang naik" vs "sudah lewat puncak").
-- Berbasis perbandingan score hari-kini vs score hari-sebelumnya per (keyword, niche, source).
-- Semua nullable → baris lama (tanpa baseline) aman; velocity tetap null sampai 2+ data poin.

alter table trend_ideas
  add column if not exists prev_score numeric,
  add column if not exists velocity numeric,
  add column if not exists trend_direction text; -- 'up' | 'stable' | 'down'

-- Index pembantu: cepat cari baseline hari kemarin per (keyword, niche, source).
create index if not exists idx_trend_ideas_velocity_baseline
  on trend_ideas (keyword, niche_slug, source, fetched_at desc);