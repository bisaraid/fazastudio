-- Faza Studio Database Schema — Migration 019 (ACS)
-- ============================================================
-- KEAMANAN: Perbaiki policy RLS yang salah role (temuan S1 audit)
-- ============================================================
-- MASALAH:
--   Policy "Service role full access" (migrasi 012) dan
--   "Service role full access script_generations" (migrasi 013) TIDAK
--   mencantumkan klausa `to service_role`. Di PostgreSQL/Supabase,
--   `create policy` tanpa `to <role>` berlaku untuk role `public`
--   (gabungan `anon` + `authenticated`).
--   Akibatnya siapa pun dengan anon key bisa SELECT/INSERT/UPDATE/DELETE
--   langsung ke `trend_ideas` & `script_generations` — bertentangan dengan
--   komentar migrasi yang mengklaim "hanya service role".
--
-- PERBAIKAN:
--   1. DROP policy yang salah (idempoten via IF EXISTS).
--   2. RECREATE dengan klausa `to service_role` eksplisit agar intent
--      menjadi jelas dan role anon/authenticated tidak lagi terjangkau.
--      (Catatan: service_role memang sudah bypass RLS — klausa ini membuat
--      policy konsisten dengan niat awal tanpa mengubah perilaku.)
--   3. VERIFIKASI: DO-block menggagalkan migrasi jika masih ada policy di
--      kedua tabel yang menjangkau role anon/authenticated — termasuk
--      policy `to public` (pg_policies merekamnya sebagai roles = {public}).

-- ============================================================
-- 1. DROP policy yang salah
-- ============================================================
drop policy if exists "Service role full access" on trend_ideas;
drop policy if exists "Service role full access script_generations" on script_generations;
drop policy if exists "Public read script_generations" on script_generations;

-- ============================================================
-- 2. RECREATE dengan klausa `to service_role`
-- ============================================================
create policy "Service role full access"
  on trend_ideas
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role full access script_generations"
  on script_generations
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- 3. VERIFIKASI — pastikan tidak ada policy anon/authenticated
--    yang tersisa di kedua tabel.
--    Jika masih ada → migration GAGAL (raise exception).
-- ============================================================
do $$
declare
  v_bad int;
begin
  select count(*) into v_bad
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('trend_ideas', 'script_generations')
      -- 'public' ikut dicek: policy `to public` (roles={public}) juga
      -- menjangkau anon + authenticated.
      and (p.roles::text[] && array['anon', 'authenticated', 'public']);

  if v_bad > 0 then
    raise exception 'BLOCKED: masih ada % policy pada trend_ideas/script_generations yang menjangkau anon/authenticated. Periksa migrasi sebelum 019.', v_bad;
  end if;
end $$;

-- ============================================================
-- Verifikasi manual (opsional, untuk SQL editor / dashboard):
-- ============================================================
-- select tablename, policyname, roles, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('trend_ideas', 'script_generations');
-- -- Harapan: baris policy dengan roles = {service_role} saja.