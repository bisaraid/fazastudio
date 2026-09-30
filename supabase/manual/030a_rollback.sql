-- Faza Studio — 030A (deliverable C2): ROLLBACK
-- ============================================================
-- Mengembalikan skema + RPC ke kondisi SEBELUM 030_plan_expiry.sql:
--   1. Trigger trg_user_usage_plan_expiry & fungsinya dihapus.
--   2. ensure_usage_row        → body versi 014 (jalur anon).
--   3. ensure_usage_row_by_user → body versi 028 (jalur akun).
--   4. Helper plan_is_active / effective_plan / effective_credits_total dihapus.
--   5. Kolom plan_expires_at / plan_activated_at / plan_source dihapus.
--
-- KAPAN DIPAKAI: hanya bila 030A-min bermasalah. Kode aplikasi saat ini TIDAK
-- menyentuh kolom-kolom baru, jadi rollback ini tidak merusak aplikasi.
-- PERINGATAN: langkah 5 MENGHAPUS data masa berlaku yang sudah di-backfill.
-- Catat dulu bila perlu:
--   select user_id, period, plan, plan_expires_at, plan_source, plan_activated_at
--     from user_usage where plan_expires_at is not null order by period desc;
-- Jalankan SELURUH file ini dalam satu eksekusi (sudah dibungkus begin/commit).
-- Setelah rollback: jalankan supabase/manual/030a_verify.sql (a)–(c) untuk
-- memastikan kolom/trigger benar-benar sudah hilang.
-- ============================================================

begin;

-- ============================================================
-- 1. Trigger & fungsi trigger
-- ============================================================
drop trigger if exists trg_user_usage_plan_expiry on user_usage;
drop function if exists user_usage_plan_expiry_default();

-- ============================================================
-- 2. Jalur ANON → body persis versi 014
-- ============================================================
create or replace function ensure_usage_row(
  p_identity_key text,
  p_period text
) returns table (
  plan text,
  credits_total integer,
  credits_used integer
) language plpgsql as $$
begin
  insert into user_usage (identity_key, period, plan, credits_total, credits_used)
  values (p_identity_key, p_period, 'free', 10, 0)
  on conflict (identity_key, period) do nothing;

  return query
    select u.plan::text,
           u.credits_total::integer,
           u.credits_used::integer
    from user_usage u
    where u.identity_key = p_identity_key
      and u.period = p_period;
end;
$$;

-- ============================================================
-- 3. Jalur AKUN → body persis versi 028
-- ============================================================
create or replace function ensure_usage_row_by_user(
  p_user_id uuid,
  p_period text
) returns table (
  plan text,
  credits_total integer,
  credits_used integer
) language plpgsql as $$
begin
  insert into user_usage (user_id, identity_key, period, plan, credits_total, credits_used)
  values (p_user_id, 'account:' || p_user_id::text, p_period, 'free', 10, 0)
  on conflict (user_id, period) do nothing;

  return query
    select u.plan::text,
           u.credits_total::integer,
           u.credits_used::integer
    from user_usage u
    where u.user_id = p_user_id
      and u.period = p_period
    limit 1;
end;
$$;

-- ============================================================
-- 4. Helper dihapus (tidak ada objek lain yang bergantung padanya)
-- ============================================================
drop function if exists effective_credits_total(text, timestamptz, integer);
drop function if exists effective_plan(text, timestamptz);
drop function if exists plan_is_active(text, timestamptz);

-- ============================================================
-- 5. Kolom dihapus — DATA MASA BERLAKU HILANG (lihat peringatan di header)
-- ============================================================
alter table user_usage
  drop column if exists plan_source,
  drop column if exists plan_activated_at,
  drop column if exists plan_expires_at;

notify pgrst, 'reload schema';

commit;
