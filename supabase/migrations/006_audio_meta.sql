-- ACS Migration 006 — Audio metadata (untuk menampilkan label suara yang benar)
-- Menyimpan provider TTS & info suara agar tidak hilang saat reload.
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS audio_provider TEXT,
ADD COLUMN IF NOT EXISTS audio_voice TEXT,
ADD COLUMN IF NOT EXISTS audio_speed REAL,
ADD COLUMN IF NOT EXISTS audio_emotion TEXT;