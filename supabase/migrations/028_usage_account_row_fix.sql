-- Faza Studio — Migration 028: perbaikan baris `user_usage` jalur AKUN (user_id)
-- ============================================================
-- BUG (2026-09-30): aktivasi plan dari /admin/transaksi membalas
--   "Gagal memperbarui plan" (HTTP 500) padahal user SUDAH terdaftar.
--
-- AKAR MASALAH (skema, bukan lookup):
--   003_usage.sql             : identity_key text NOT NULL   (tanpa default)
--   018_user_scoped_usage.sql : jalur akun menulis
--       insert into user_usage (user_id, period, plan, credits_total, credits_used)
--     → kolom identity_key TIDAK diisi  ⇒ Postgres 23502:
--       null value in column "identity_key" of relation "user_usage"
--       violates not-null constraint
--   `setPlanForUser` (src/lib/usage.ts) memakai payload yang sama, jadi
--   upsert-nya selalu jatuh ke cabang INSERT → 23502 → route membalas 500.
--   Efek samping (belum terlihat di UI): RPC `ensure_usage_row_by_user` (018)
--   juga selalu gagal, sehingga baris usage akun tidak pernah tercipta dan
--   `decrement_credit_by_user` tidak pernah match (metering jalur akun mati).
--
-- ISI (IDEMPOTEN — aman dijalankan berulang):
--   1. Merge baris duplikat (user_id, period) bila ada.
--   2. Fill identity_key baris akun yang masih NULL → 'account:<user_id>'.
--   3. Drop NOT NULL pada identity_key (baris anon selalu mengisinya).
--   4. Pastikan unique index (user_id, period) ada — syarat ON CONFLICT.
--   5. Recreate ensure_usage_row_by_user() agar ikut mengisi identity_key
--      (benar sebelum MAUPUN sesudah langkah 3).
--
-- CATATAN: tidak menyentuh lifecycle/expiry plan — hanya constraint + nilai
-- identity_key baris akun.
-- ============================================================

-- ============================================================
-- 1. Merge baris duplikat (user_id, period) — blok sama dengan 018
-- ============================================================
DO $$
DECLARE
  r       record;
  v_keep  uuid;
  v_used  integer;
  v_total integer;
  v_plan  text;
BEGIN
  FOR r IN
    SELECT u.user_id, u.period
    FROM user_usage u
    WHERE u.user_id IS NOT NULL
    GROUP BY u.user_id, u.period
    HAVING count(*) > 1
  LOOP
    -- Baris "kustode": total tertua (tie → used tertua → id)
    SELECT id INTO v_keep
      FROM user_usage
      WHERE user_id = r.user_id AND period = r.period
      ORDER BY credits_total DESC, credits_used DESC, id
      LIMIT 1;

    SELECT sum(credits_used), max(credits_total)
      INTO v_used, v_total
      FROM user_usage
      WHERE user_id = r.user_id AND period = r.period;

    -- Plan prioritas: pro (3) > starter (2) > free (1)
    SELECT plan INTO v_plan
      FROM user_usage
      WHERE user_id = r.user_id AND period = r.period
      ORDER BY CASE plan WHEN 'pro' THEN 3 WHEN 'starter' THEN 2 ELSE 1 END DESC
      LIMIT 1;

    UPDATE user_usage
      SET credits_used = LEAST(v_total, v_used),
          credits_total = v_total,
          plan = v_plan,
          updated_at = now()
      WHERE id = v_keep;

    DELETE FROM user_usage
      WHERE user_id = r.user_id AND period = r.period
        AND id <> v_keep;
  END LOOP;
END $$;

-- ============================================================
-- 2. Fill identity_key baris akun yang NULL (jalur akun tidak punya device)
-- ============================================================
update user_usage
   set identity_key = 'account:' || user_id::text,
       updated_at = now()
 where user_id is not null
   and identity_key is null;

-- ============================================================
-- 3. identity_key boleh NULL untuk baris akun (baris anon tetap selalu isi)
-- ============================================================
alter table user_usage alter column identity_key drop not null;

-- ============================================================
-- 4. Unique index (user_id, period) — non-partial & tanpa ekspresi,
--    supaya bisa dipakai ON CONFLICT (user_id, period) oleh PostgREST.
-- ============================================================
create unique index if not exists uq_user_usage_user_period
  on user_usage (user_id, period);


-- ============================================================
-- 5. ensure_usage_row_by_user — get-or-create yang ikut mengisi identity_key
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
-- QUERY VERIFIKASI (aman dijalankan setelah script di atas)
-- ============================================================

-- (a) identity_key sudah boleh NULL? → is_nullable harus YES
select column_name, is_nullable, column_default
  from information_schema.columns
 where table_name = 'user_usage'
   and column_name in ('identity_key', 'user_id', 'period')
 order by column_name;

-- (b) unique index yang dibutuhkan ON CONFLICT sudah ada?
--     harus memuat uq_user_usage_user_period (user_id, period) dan
--     uq_user_usage_identity_period (identity_key, period)
select indexname, indexdef
  from pg_indexes
 where tablename = 'user_usage'
 order by indexname;

-- (c) baris akun tanpa identity_key → harus 0
select count(*) as baris_akun_tanpa_identity_key
  from user_usage
 where user_id is not null and identity_key is null;

-- (d) duplikat (user_id, period) → harus kosong
select user_id, period, count(*) as jumlah
  from user_usage
 where user_id is not null
 group by user_id, period
having count(*) > 1;

-- (e) definisi RPC terbaru (harus memuat 'account:')
select pg_get_functiondef('ensure_usage_row_by_user(uuid,text)'::regprocedure);

-- (f) baris milik satu user (ganti <USER_UUID> dengan userId dari Auth)
select id, user_id, identity_key, period, plan, credits_total, credits_used, updated_at
  from user_usage
 where user_id = '<USER_UUID>'
 order by period desc;
