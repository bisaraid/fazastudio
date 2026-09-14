-- Faza Studio Database Schema — Migration 020 (ACS)
-- ============================================================
-- Tambah kolom projects.metadata (JSONB) — menyimpan state pipeline yang
-- belum terpersist sebelumnya:
--   currentStep, subtitleSrt, audioProvider/speed/emotion,
--   overridePlatform, overrideDuration.
-- Read-optimized: tidak di-query index mahal; hanya dibaca saat membuka editor.
-- ============================================================

alter table projects
  add column if not exists metadata jsonb not null default '{}'::jsonb;