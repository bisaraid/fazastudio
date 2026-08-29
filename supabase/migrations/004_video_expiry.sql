-- ACS Migration 004 — Video expiry & storage plan (Cloudflare R2)
-- Menyimpan metadata penyimpanan video:
--   video_storage_plan : "free" | "premium" (folder R2 tempat video diunggah)
--   video_expires_at   : kapan video free akan kedaluwarsa (null = permanen, premium)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS video_storage_plan TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS video_expires_at TIMESTAMPTZ DEFAULT NULL;