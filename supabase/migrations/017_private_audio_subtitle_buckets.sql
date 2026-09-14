-- Faza Studio Database Schema — Migration 017 (ACS)
-- ============================================================
-- Ubah bucket storage acs-audio dan acs-subtitles dari PUBLIC menjadi PRIVATE.
-- Setelah ini, seluruh akses object harus via signed URL(createSignedUrl);
-- ============================================================

update storage.buckets
set public = false
where id in ('acs-audio', 'acs-subtitles');