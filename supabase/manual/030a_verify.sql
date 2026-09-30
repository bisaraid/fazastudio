-- Faza Studio — 030A (deliverable C1): QUERY VERIFIKASI
-- ============================================================
-- Jalankan SETELAH supabase/migrations/030_plan_expiry.sql.
-- Query (a)–(f), (h), (j) READ-ONLY. Query (g) memanggil ensure_usage_row_by_user
-- sehingga MENULIS 1 baris carry-over — itu memang disengaja (preflight).
-- Query (i) sengaja ditulis TERAKHIR karena memakai begin/rollback: jalankan
-- blok itu TERPISAH dari blok lain (lihat catatan di blok (i)).
-- Tiap query mencantumkan HARAPAN hasil agar mudah dibandingkan.
-- ============================================================


-- ============================================================
-- (a) Kolom baru sudah ada?
--     HARAPAN: 3 baris; kolom plan_source text, 2 lainnya timestamptz;
--              is_nullable = YES semuanya.
-- ============================================================
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'user_usage'
   and column_name in ('plan_expires_at', 'plan_activated_at', 'plan_source')
 order by column_name;


-- ============================================================
-- (b) Trigger aktif?
--     HARAPAN: 1 baris —
--       BEFORE INSERT OR UPDATE OF plan, plan_expires_at ON user_usage
--       FOR EACH ROW EXECUTE FUNCTION user_usage_plan_expiry_default()
-- ============================================================
select tgname, pg_get_triggerdef(oid) as definisi
  from pg_trigger
 where tgrelid = 'user_usage'::regclass
   and not tgisinternal;


-- ============================================================
-- (c) Helper berperilaku benar?
--     HARAPAN kolom demi kolom:
--       legacy_permanen = true   (expiry NULL + plan berbayar = permanen)
--       belum_lewat     = true
--       sudah_lewat     = false
--       free_selamanya  = false
--       efektif_turun   = 'free' (expired → terbaca free)
--       total_turun     = 10     (expired → kuota free)
-- ============================================================
select plan_is_active('starter', null)                                 as legacy_permanen,
       plan_is_active('starter', now() + interval '1 day')             as belum_lewat,
       plan_is_active('starter', now() - interval '1 day')             as sudah_lewat,
       plan_is_active('free', null)                                    as free_selamanya,
       effective_plan('starter', now() - interval '1 day')             as efektif_turun,
       effective_credits_total('starter', now() - interval '1 day', 30) as total_turun;


-- ============================================================
-- (d) Definisi RPC terbaru memuat direktif & aturan carry-over?
--     HARAPAN: kedua kolom body memuat '#variable_conflict use_column'
--              dan 'carryover'.
-- ============================================================
select pg_get_functiondef('ensure_usage_row(text,text)'::regprocedure)         as definisi_anon,
       pg_get_functiondef('ensure_usage_row_by_user(uuid,text)'::regprocedure) as definisi_akun;


-- ============================================================
-- (e) Baris berbayar yang sudah lewat masa berlaku TAPI belum ternormalisasi.
--     HARAPAN: 0. Bila > 0 itu BUKAN kegagalan migrasi — 030A-min tidak punya
--     sweep, jadi baris menyembuhkan diri saat user pertama kali mengakses.
--     Angka ini bisa dipakai sebagai indikator "expiry menunggu dibaca".
-- ============================================================
select count(*) as kedaluwarsa_belum_dinormalisasi
  from user_usage
 where coalesce(plan, 'free') <> 'free'
   and plan_expires_at is not null
   and plan_expires_at <= now();


-- ============================================================
-- (f) SIMULASI carry-over user target (read-only, tidak menulis).
--     HARAPAN: 1 baris — periode_sumber '2026-09', plan 'starter',
--              akan_terbawa = true, plan_efektif = 'starter'.
-- ============================================================
select p.period                                   as periode_sumber,
       p.plan,
       p.credits_total,
       p.plan_expires_at,
       plan_is_active(p.plan, p.plan_expires_at)  as akan_terbawa,
       effective_plan(p.plan, p.plan_expires_at)  as plan_efektif
  from user_usage p
  join auth.users a on a.id = p.user_id
 where lower(a.email) = 'xzoommedia@gmail.com'
   and p.period < '2026-10'
 order by p.period desc
 limit 1;


-- ============================================================
-- (g) PREFLIGHT carry-over nyata — ADA EFEK TULIS (membuat baris 2026-10).
--     HARAPAN: plan='starter', credits_total=30, credits_used=0.
--     Sama dengan B4 di 030a_backfill_plan_expiry.sql → jalankan SALAH SATU
--     saja. Idempoten: baris yang sudah ada tidak diubah (ON CONFLICT DO NOTHING).
-- ============================================================
select a.email, r.plan, r.credits_total, r.credits_used
  from auth.users a
  cross join lateral ensure_usage_row_by_user(a.id, '2026-10') r
 where lower(a.email) = 'xzoommedia@gmail.com';


-- ============================================================
-- (h) Kondisi akhir semua baris user target.
--     HARAPAN:
--       2026-10 | starter | 30 | 0 | 2026-10-30… | carryover      | true | 30
--       2026-09 | starter | 30 | 0 | 2026-10-30… | admin-backfill | true | 30
-- ============================================================
select uu.period,
       uu.plan,
       uu.credits_total,
       uu.credits_used,
       uu.plan_expires_at,
       uu.plan_source,
       plan_is_active(uu.plan, uu.plan_expires_at) as plan_berbayar_aktif,
       effective_credits_total(uu.plan, uu.plan_expires_at, uu.credits_total) as total_efektif
  from user_usage uu
  join auth.users a on a.id = uu.user_id
 where lower(a.email) = 'xzoommedia@gmail.com'
 order by uu.period desc;


-- ============================================================
-- (j) DETEKSI downgrade yang TIDAK menyembuhkan diri (read-only).
--     Kasus: baris periode berjalan terlanjur dibuat 'free' oleh kode lama
--     (mis. request pertama tanggal 1 SEBELUM migrasi ini jalan), padahal
--     periode sebelumnya berbayar & masih aktif. Carry-over tidak menimpa
--     baris yang sudah ada (ON CONFLICT DO NOTHING) → perlu tindakan manual.
--     HARAPAN: 0 baris.
-- ============================================================
select a.email,
       uu.period          as periode_berjalan,
       uu.plan            as plan_berjalan,
       sr.period          as periode_sumber,
       sr.plan            as plan_sumber,
       sr.plan_expires_at as expiry_sumber
  from user_usage uu
  join auth.users a on a.id = uu.user_id
  join lateral (
    select p.period, p.plan, p.plan_expires_at
      from user_usage p
     where p.user_id = uu.user_id
       and p.period < uu.period
       and coalesce(p.plan, 'free') <> 'free'
       and plan_is_active(p.plan, p.plan_expires_at)
     order by p.period desc
     limit 1
  ) sr on true
 where coalesce(uu.plan, 'free') = 'free'
   and uu.period = to_char(now() at time zone 'utc', 'YYYY-MM')
 order by a.email;

-- Perbaikan KONDISIONAL untuk user target — jalankan HANYA bila (j) menampilkan
-- barisnya. Sengaja dikomentari agar tidak terjalankan tanpa sengaja:
-- with target as (
--   select id from auth.users where lower(email) = 'xzoommedia@gmail.com'
-- ), src as (
--   select p.plan, p.credits_total, p.plan_expires_at
--     from user_usage p join target t on t.id = p.user_id
--    where p.period = '2026-09'
--    limit 1
-- )
-- update user_usage u
--    set plan              = (select s.plan from src s),
--        credits_total     = (select s.credits_total from src s),
--        plan_expires_at   = (select s.plan_expires_at from src s),
--        credits_used      = 0,
--        plan_activated_at = coalesce(u.plan_activated_at, now()),
--        plan_source       = 'admin-fix',
--        updated_at        = now()
--   from target t
--  where u.user_id = t.id
--    and u.period = '2026-10'
--    and coalesce(u.plan, 'free') = 'free';


-- (i) UJI NEGATIF trigger.
--     !!! JALANKAN BLOK INI TERPISAH dari blok (a)–(h) !!!
--     Blok ini memakai begin/rollback; bila ditumpuk dengan blok lain dalam
--     satu batch, rollback dapat membatalkan efek tulis blok (g).
--     HARAPAN:
--       tahap 1 → idempoten = true (menulis plan yang sama TIDAK menggeser
--                 plan_expires_at)
--       tahap 2 → plan='free', plan_expires_at/plan_activated_at/plan_source
--                 ketiganya NULL
-- ============================================================
begin;
  create temp table _expiry_before on commit drop as
  select u.plan_expires_at as expiry
    from user_usage u
    join auth.users a on a.id = u.user_id
   where lower(a.email) = 'xzoommedia@gmail.com'
     and u.period = '2026-09';

  -- 1) Menulis ulang plan yang SAMA tidak boleh menggeser deadline.
  update user_usage u
     set plan = 'starter', updated_at = now()
   where u.user_id in (select id from auth.users where lower(email) = 'xzoommedia@gmail.com')
     and u.period = '2026-09';

  select (select b.expiry from _expiry_before b) as expiry_sebelum,
         u.plan_expires_at                       as expiry_sesudah,
         u.plan_expires_at is not distinct from (select b.expiry from _expiry_before b) as idempoten
    from user_usage u
    join auth.users a on a.id = u.user_id
   where lower(a.email) = 'xzoommedia@gmail.com'
     and u.period = '2026-09';

  -- 2) Plan → free harus mengosongkan metadata masa berlaku.
  update user_usage u
     set plan = 'free', updated_at = now()
   where u.user_id in (select id from auth.users where lower(email) = 'xzoommedia@gmail.com')
     and u.period = '2026-09';

  select u.plan, u.plan_expires_at, u.plan_activated_at, u.plan_source
    from user_usage u
    join auth.users a on a.id = u.user_id
   where lower(a.email) = 'xzoommedia@gmail.com'
     and u.period = '2026-09';
rollback;
