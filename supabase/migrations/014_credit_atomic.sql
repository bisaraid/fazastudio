-- Faza Studio Database Schema — Migration 014 (ACS)
-- ============================================================
-- Kredit sistem: FIX RACE CONDITION (Sesi 1)
-- ============================================================
-- MASALAH yang di-fix:
--   1) fetchOrCreate (SELECT-then-INSERT) tidak atomic → dua request
--      concurrent bisa race pada unique constraint (identity_key, period);
--      salah satu INSERT gagal, defaults yang di-return basi/stale.
--   2) decrementCredit: READ -> CHECK -> UPDATE credits_used = x+1 dengan
--      nilai x yang STALE dari hasil READ. Dua request baca used=9
--      (total=10), dua-dua increment → used=11 → OVERS PEND: user
--      terpakai melebihi kuota yang seharusnya.
--
-- SOLUSI: stored procedures ATOMIC di sisi database.
--   - ensure_usage_row() : INSERT ... ON CONFLICT (identity_key, period)
--     DO NOTHING, lalu SELECT & RETURN row. Idempoten, satu query.
--   - decrement_credit() : UPDATE ... SET credits_used = credits_used + 1
--     WHERE credits_used < credits_total RETURNING credits_used.
--     Postgres row-lock membuat concurrent UPDATE serialized: request
--     kedua WHERE-nya dievaluasi atas baris yang ber-commit — jika kuota
--     sudah habis, RETURNING kosong → caller menerima NULL → tida suka.
--
-- NOTA SECURITY:
--   - RLS tetap dienable. Pemanggil function tsb adalah service-role client
--     (bypass RLS). Function berjalan dengan seducer privilege
--     (SECURITY DEFINER default) — tetap aman untuk endpoint server-side.

-- ============================================================
-- 1. ensure_usage_row (atomic get-or-create)
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
-- 2. decrement_credit (atomic conditional decrement)
-- ============================================================
-- Return integer (credits_used yang baru) atau NULL jika:
--   - kuota habis (credits_used >= credits_total), atau
--   - baris belum ada (caller harus ensure_usage_row dulu).

create or replace function decrement_credit(
  p_identity_key text,
  p_period text
) returns integer language plpgsql as $$
declare
  v_credits_used integer;
begin
  update user_usage
  set credits_used = credits_used + 1,
      updated_at = now()
  where identity_key = p_identity_key
    and period = p_period
    and credits_used < credits_total
  returning credits_used into v_credits_used;

  -- NULL jika UPDATE tidak match → kuota habis / row tidak tersedia.
  return v_credits_used;
end;
$$;

-- ============================================================
-- 3. Permissions
-- ============================================================
-- Service role (postgres) sudah auto-grant execute via bypass RLS.
-- anon/authenticated tidak perlu execute — semua panggil route
-- server-side. Tidak ada grant eksplisit diperlukan.