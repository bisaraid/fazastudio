-- Faza Studio — 030A (deliverable B): BACKFILL masa berlaku plan + PREFLIGHT carry-over
-- ============================================================
-- MANUAL RUN — JANGAN ditaruh di supabase/migrations/ (menyasar data spesifik).
-- Urutan: 1) supabase/migrations/030_plan_expiry.sql  2) file ini
--         3) supabase/manual/030a_verify.sql
--
-- Target: xzoommedia@gmail.com — diidentifikasi via email → auth.users.id,
-- TANPA placeholder UUID. Bila email lain, ganti di SETIAP statement (4 tempat).
--
-- B1  Preflight: seluruh baris usage user target (sebelum diubah).
-- B2  Backfill : baris periode '2026-09' diberi plan_expires_at = now() + 30 hari
--               + plan_source='admin-backfill' (D1: expiry eksplisit).
-- B3  Opsional : selaraskan baris periode > '2026-09' yang sudah terlanjur
--               ter-carry-over tanpa expiry (kalau server sudah lewat bulan).
-- B4  Preflight carry-over periode '2026-10' via ensure_usage_row_by_user().
-- B5  Konfirmasi kondisi akhir.
-- ============================================================


-- ============================================================
-- B1. PREFLIGHT — lihat dulu, jangan ubah apa pun
-- ============================================================
select a.id as user_id,
       a.email,
       uu.period,
       uu.plan,
       uu.credits_total,
       uu.credits_used,
       uu.plan_expires_at,
       uu.plan_activated_at,
       uu.plan_source,
       plan_is_active(uu.plan, uu.plan_expires_at) as plan_berbayar_aktif,
       to_char(now() at time zone 'utc', 'YYYY-MM') as period_utc_sekarang
  from auth.users a
  left join user_usage uu on uu.user_id = a.id
 where lower(a.email) = 'xzoommedia@gmail.com'
 order by uu.period desc nulls last;

-- HARAPAN: 1 baris user_id terisi; baris periode 2026-09 plan='starter',
--   credits_total=30, plan_expires_at = NULL  ← ini yang di-backfill di B2,
--   plan_berbayar_aktif = true (NULL dianggap legacy/permanen).
--   Baris 2026-10 biasanya BELUM ada (dibuat di B4).
--   Kolom period_utc_sekarang berguna: kalau sudah '2026-10' berarti server
--   sudah melewati batas bulan → B3 relevan.


-- ============================================================
-- B2. BACKFILL — nyalakan jam masa berlaku 30 hari untuk periode 2026-09
-- ============================================================
-- Idempoten: hanya menyentuh baris yang plan_expires_at-nya masih NULL,
-- jadi aman diulang (jalan kedua = 0 baris).
with target as (
  select id from auth.users where lower(email) = 'xzoommedia@gmail.com'
)
update user_usage u
   set plan_expires_at   = now() + interval '30 days',
       plan_activated_at = coalesce(u.plan_activated_at, now()),
       plan_source       = 'admin-backfill',
       updated_at        = now()
  from target t
 where u.user_id = t.id
   and u.period = '2026-09'
   and coalesce(u.plan, 'free') <> 'free'
   and u.plan_expires_at is null
returning u.period, u.plan, u.credits_total, u.credits_used,
          u.plan_expires_at, u.plan_source;

-- HARAPAN: 1 baris — period='2026-09', plan='starter', credits_total=30,
--   plan_expires_at ≈ 2026-10-30 (now + 30 hari), plan_source='admin-backfill'.
-- CATATAN: trigger trg_user_usage_plan_expiry TIDAK menimpa nilai ini karena
--   kolom plan tidak berubah (hanya plan_expires_at) → plan_activated_at aman.


-- ============================================================
-- B3. OPSIONAL — selaraskan baris periode setelahnya yang belum punya expiry
-- ============================================================
-- Nol baris pada kondisi normal malam ini (baris 2026-10 belum dibuat).
-- Kalau baris 2026-10 sudah ada dan expiry-nya NULL (ter-carry-over dari
-- 2026-09 sebelum B2 jalan), baris itu akan "permanen" bila tidak diselaraskan.
with target as (
  select id from auth.users where lower(email) = 'xzoommedia@gmail.com'
), deadline as (
  select u.plan_expires_at as expiry
    from user_usage u
    join target t on t.id = u.user_id
   where u.period = '2026-09'
     and u.plan_expires_at is not null
   limit 1
)
update user_usage u
   set plan_expires_at = (select d.expiry from deadline d),
       updated_at      = now()
  from target t
 where u.user_id = t.id
   and u.period > '2026-09'
   and coalesce(u.plan, 'free') <> 'free'
   and u.plan_expires_at is null;

-- HARAPAN: 0 baris (normal) atau 1 baris (kasus server sudah lewat bulan).


-- ============================================================
-- B4. PREFLIGHT CARRY-OVER periode 2026-10 (ada efek tulis)
-- ============================================================
-- Baris 2026-10 dibuat lebih awal — memang tujuannya, supaya tidak ada
-- downgrade saat tanggal 1. Hasil yang dibaca konsumen = kolom hasil RPC ini.
select a.email,
       r.plan,
       r.credits_total,
       r.credits_used
  from auth.users a
  cross join lateral ensure_usage_row_by_user(a.id, '2026-10') r
 where lower(a.email) = 'xzoommedia@gmail.com';

-- HARAPAN: 1 baris — plan='starter', credits_total=30, credits_used=0
--   (carry-over dari 2026-09 karena masa berlakunya masih aktif).


-- ============================================================
-- B5. KONFIRMASI kondisi akhir
-- ============================================================
select uu.period,
       uu.plan,
       uu.credits_total,
       uu.credits_used,
       uu.plan_expires_at,
       uu.plan_source,
       plan_is_active(uu.plan, uu.plan_expires_at) as plan_berbayar_aktif
  from user_usage uu
  join auth.users a on a.id = uu.user_id
 where lower(a.email) = 'xzoommedia@gmail.com'
 order by uu.period desc;

-- HARAPAN:
--   2026-10 | starter | 30 | 0 | 2026-10-30… | carryover       | true
--   2026-09 | starter | 30 | 0 | 2026-10-30… | admin-backfill  | true
