-- Faza Studio Database Schema — Migration 021 (Behavior Foundation)
-- Tambah kolom value ke behavior_events.
-- JSONB berisi nilai aktual per event: provider, duration, platform, speed, emotion, dll.
-- Fleksibel menyimpan kombinasi nilai yang berbeda-beda tanpa perlu schema tetap (redshaped).
-- Nullable → event lama (pra-migrasi) tetap valid; insert tanpa value otomatis null.

alter table behavior_events
  add column if not exists value jsonb;