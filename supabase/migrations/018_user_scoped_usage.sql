-- Faza Studio Database Schema — Migration 018 (ACS)
-- ============================================================
-- METERING KEYED BY AKUN (user_id) — REVISI metering Faza Studio
-- ============================================================
-- - Anon:  metering masih via (identity_key, period)   [existing RPC 014]
-- - Login: metering terikat ke user_id (akun), bukan cookie/device.
--
-- INHOUD:
--   1. Merge baris duplikat (user_id, period) jika ada (legacy claim).
--   2. Unique index per (user_id, period) — dasar atomicity.
--   3. RPC ensure_usage_row_by_user()   — get-or-create keyed by user.
--   4. RPC decrement_credit_by_user()   — atomic decrement keyed by user.
--   5. RPC claim_usage_to_user()        — memindahkan plan+kredit anon -> akun.
--
-- NOTA: function lama (014) pertahanan untuk jalur anon.
-- NOTA SECURITY: function dipanggil via service-role (bypass RLS), SECURITY
-- DEFINER default — aman untuk endpoint server-side.

-- ============================================================
-- 1. Cleanup duplikat (aman bila tidak ada; idempoten)
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
-- 2. Unique index per (user_id, period)
-- ============================================================
create unique index if not exists uq_user_usage_user_period
  on user_usage (user_id, period);

-- ============================================================
-- 3. ensure_usage_row_by_user (atomic get-or-create)
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
  insert into user_usage (user_id, period, plan, credits_total, credits_used)
  values (p_user_id, p_period, 'free', 10, 0)
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
-- 4. decrement_credit_by_user (atomic conditional decrement)
-- ============================================================
-- Return credits_used yang baru, atau NULL jika kuota habis/row belum ada.
create or replace function decrement_credit_by_user(
  p_user_id uuid,
  p_period text
) returns integer language plpgsql as $$
declare
  v_credits_used integer;
begin
  update user_usage
  set credits_used = credits_used + 1,
      updated_at = now()
  where user_id = p_user_id
    and period = p_period
    and credits_used < credits_total
  returning credits_used into v_credits_used;

  return v_credits_used;
end;
$$;

-- ============================================================
-- 5. claim_usage_to_user (memindahkan plan + kredit ter-sisa ke akun)
-- ============================================================
-- Iterate baris anon (identity_key = p_identity_key, user_id null):
--   - Belum ada baris akun untuk (user_id, period) → re-key baris ini ke akun
--     (plan & kredit ikut apa adanya).
--   - Baris akun sudah ada → merge: used = min(total, used+used), total = max,
--     plan = prioritas tertua (pro > starter > free), lalu baris anon dihapus.
-- Idempoten & aman untuk multi-device/concurrent (baris anon hanya disentuh
-- bila user_id masih null).
create or replace function claim_usage_to_user(
  p_user_id uuid,
  p_identity_key text
) returns integer language plpgsql as $$
declare
  r                    record;
  v_target_id          uuid;
  v_claimed            integer := 0;
  v_plan_priority      integer;
  v_target_priority    integer;
begin
  for r in
    select u.id, u.period, u.plan, u.credits_total, u.credits_used
    from user_usage u
    where u.identity_key = p_identity_key
      and u.user_id is null
  loop
    -- Baris akun target untuk periode yang sama (unique index → max 1).
    select t.id into v_target_id
      from user_usage t
      where t.user_id = p_user_id
        and t.period = r.period
      limit 1;

    if v_target_id is null then
      -- Re-key: plan & kredit lama ikut baris → akun.
      update user_usage
      set user_id = p_user_id, updated_at = now()
      where id = r.id
        and user_id is null;
    else
      select case r.plan when 'pro' then 3 when 'starter' then 2 else 1 end
        into v_plan_priority;
      select case t.plan when 'pro' then 3 when 'starter' then 2 else 1 end
        into v_target_priority
        from user_usage t
        where t.id = v_target_id;

      update user_usage
      set credits_used = LEAST(credits_total, credits_used + r.credits_used),
          credits_total = GREATEST(credits_total, r.credits_total),
          plan = case
                   when v_plan_priority > v_target_priority then r.plan
                   else plan
                 end,
          updated_at = now()
      where id = v_target_id;

      delete from user_usage where id = r.id;
    end if;

    v_claimed := v_claimed + 1;
  end loop;

  return v_claimed;
end;
$$;

-- ============================================================
-- 6. Permissions
-- ============================================================
-- Service role auto-grant execute via bypass RLS; anon/authenticated
-- tidak perlu execute — semua panggil route server-side.