-- Faza Studio — 031 (Fase 4A / revisi 6A): ROLLBACK
-- ============================================================
-- Mengembalikan skema ke kondisi SEBELUM supabase/migrations/031_credit_refund.sql:
--   1. Fungsi refund_credit & refund_credit_by_user dihapus (drop function if exists).
--   2. Tabel ledger credit_refunds dihapus (drop table if exists).
--
-- CATATAN EKSEKUSI (revisi 6A): SQL Editor Supabase TIDAK menjaga transaksi
-- lintas statement, jadi file ini TANPA begin/commit. Semua statement
-- idempoten (semuanya memakai `if exists`) dan aman dijalankan terpisah /
-- diulang; bila ada statement gagal, jalankan ulang file ini sampai bersih.
--
-- PERINGATAN: langkah 2 MEMBUANG DATA LEDGER REFUND. Catat dulu bila perlu audit:
--   select * from credit_refunds order by created_at desc;
--
-- DAMPAK KE KODE APLIKASI: src/lib/credit-refund.ts (dipakai
-- /api/generate-script) memanggil kedua RPC. Setelah rollback pemanggilan RPC
-- GAGAL → refundScriptDebit mengembalikan status "unavailable" (fail-open,
-- TIDAK melempar) dan generate tetap berjalan — tetapi kredit TIDAK bisa
-- dikembalikan otomatis sampai 031 dipasang ulang.
--
-- Setelah rollback: jalankan supabase/manual/031_verify.sql Query 1–3 —
-- HARAPAN QUERY 1–3 menunjukkan objek sudah tidak ada (Query 1: fungsi_ada =
-- false; Query 2: GAGAL karena grant ikut hilang; Query 3: GAGAL karena
-- tabel tidak ada) — itu artinya rollback BERHASIL.
-- STATUS: file ini BELUM dijalankan oleh tim kode ini.
-- ============================================================

drop function if exists refund_credit(text, text, text, text);

drop function if exists refund_credit_by_user(uuid, text, text, text);

drop table if exists credit_refunds;

notify pgrst, 'reload schema';