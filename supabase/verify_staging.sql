-- ============================================================
-- verify_staging.sql — pemeriksaan 032_render_queue.sql SETELAH deploy.
--
-- Cara pakai (staging/produksi Supabase):
--   1. Buka Dashboard → SQL Editor → New query.
--   2. Tempel SELURUH isi file ini, tekan Run.
--   3. Hasilnya satu tabel PASS/FAIL; baris "RINGKASAN" menunjukkan jumlah
--      FAIL — target: 0 FAIL.
--
-- Sifat: READ-ONLY (hanya membaca katalog, tidak mengubah data/skema).
-- Aman dijalankan berulang dan aman bila objek 032 belum ada (semua
-- pemeriksaan memakai penjaga to_regclass sehingga tidak error).
-- ============================================================

with fn as (
  select p.oid, p.proname, p.prosecdef,
         coalesce(p.proconfig, '{}'::text[]) as proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('claim_render_job', 'heartbeat_render_job',
                       'complete_render_job', 'fail_render_job',
                       'pick_pending_jobs', 'cleanup_render_jobs')
),
c (no, pemeriksaan, hasil, detail) as (
  values
  -- ---------------- Tabel & kolom ----------------
  (1, 'Tabel public.render_jobs ada',
      case when to_regclass('public.render_jobs') is not null then 'PASS' else 'FAIL' end,
      coalesce(to_regclass('public.render_jobs')::text, 'tabel tidak ditemukan')),

  (2, 'Tabel public.render_workers ada',
      case when to_regclass('public.render_workers') is not null then 'PASS' else 'FAIL' end,
      coalesce(to_regclass('public.render_workers')::text, 'tabel tidak ditemukan')),

  (3, 'Kolom render_jobs lengkap (18 kolom wajib)',
      case when (select count(*) from information_schema.columns
                  where table_schema = 'public' and table_name = 'render_jobs'
                    and column_name in ('id','project_id','identity_key','user_id','payload',
                                        'status','progress','error','attempts','max_attempts',
                                        'available_at','locked_by','locked_at','lease_expires_at',
                                        'heartbeat_at','created_at','updated_at','finished_at')) = 18
           then 'PASS' else 'FAIL' end,
      (select count(*)::text || '/18 kolom wajib ditemukan' from information_schema.columns
        where table_schema = 'public' and table_name = 'render_jobs'
          and column_name in ('id','project_id','identity_key','user_id','payload',
                              'status','progress','error','attempts','max_attempts',
                              'available_at','locked_by','locked_at','lease_expires_at',
                              'heartbeat_at','created_at','updated_at','finished_at'))),

  (4, 'Primary key render_jobs = id (penolak id duplikat)',
      case when exists (select 1 from pg_constraint k
                          join pg_class t on t.oid = k.conrelid
                          join pg_namespace n on n.oid = t.relnamespace
                         where n.nspname = 'public' and t.relname = 'render_jobs' and k.contype = 'p')
           then 'PASS' else 'FAIL' end,
      'idempotensi enqueue bergantung pada PK ini'),

  (5, 'Check constraint status (queued/active/done/failed/canceled)',
      case when exists (select 1 from pg_constraint k
                          join pg_class t on t.oid = k.conrelid
                          join pg_namespace n on n.oid = t.relnamespace
                         where n.nspname = 'public' and t.relname = 'render_jobs'
                           and k.contype = 'c' and k.conname = 'render_jobs_status_check')
           then 'PASS' else 'FAIL' end,
      'nama constraint: render_jobs_status_check'),

  (6, 'Default kolom: attempts=0, max_attempts=2',
      case when (select column_default from information_schema.columns
                  where table_schema='public' and table_name='render_jobs' and column_name='attempts') = '0'
               and (select column_default from information_schema.columns
                     where table_schema='public' and table_name='render_jobs' and column_name='max_attempts') = '2'
           then 'PASS' else 'FAIL' end,
      'attempts=' || coalesce((select column_default from information_schema.columns
                                where table_schema='public' and table_name='render_jobs'
                                  and column_name='attempts'), '?')
      || ' max_attempts=' || coalesce((select column_default from information_schema.columns
                                where table_schema='public' and table_name='render_jobs'
                                  and column_name='max_attempts'), '?')),

  -- ---------------- RLS & izin tabel ----------------
  (7, 'RLS aktif di render_jobs',
      case when coalesce((select relrowsecurity from pg_class t
                            join pg_namespace n on n.oid = t.relnamespace
                           where n.nspname = 'public' and t.relname = 'render_jobs'), false)
           then 'PASS' else 'FAIL' end,
      'pg_class.relrowsecurity'),

  (8, 'RLS aktif di render_workers',
      case when coalesce((select relrowsecurity from pg_class t
                            join pg_namespace n on n.oid = t.relnamespace
                           where n.nspname = 'public' and t.relname = 'render_workers'), false)
           then 'PASS' else 'FAIL' end,
      'pg_class.relrowsecurity'),

  (9, 'Policy SELECT "select_own_job" untuk authenticated',
      case when exists (select 1 from pg_policies
                         where schemaname = 'public' and tablename = 'render_jobs'
                           and policyname = 'select_own_job' and cmd = 'SELECT'
                           and 'authenticated' = any(roles))
           then 'PASS' else 'FAIL' end,
      'using (user_id = auth.uid())'),

  (10, 'Hanya 1 policy di render_jobs (tanpa policy INSERT/UPDATE/DELETE)',
      case when (select count(*) from pg_policies
                  where schemaname = 'public' and tablename = 'render_jobs') = 1
           then 'PASS' else 'FAIL' end,
      'jumlah policy = ' || (select count(*)::text from pg_policies
                              where schemaname = 'public' and tablename = 'render_jobs')),

  (11, 'anon TIDAK punya SELECT render_jobs',
      case when to_regclass('public.render_jobs') is null then 'FAIL'
           when not has_table_privilege('anon', 'public.render_jobs', 'select') then 'PASS'
           else 'FAIL' end,
      'has_table_privilege(anon,select) harus false'),

  (12, 'anon TIDAK punya hak tulis render_jobs (insert/update/delete)',
      case when to_regclass('public.render_jobs') is null then 'FAIL'
           when not has_table_privilege('anon', 'public.render_jobs', 'insert')
            and not has_table_privilege('anon', 'public.render_jobs', 'update')
            and not has_table_privilege('anon', 'public.render_jobs', 'delete') then 'PASS'
           else 'FAIL' end,
      'REVOKE ALL from anon'),

  (13, 'authenticated PUNYA SELECT render_jobs (baca job sendiri)',
      case when to_regclass('public.render_jobs') is null then 'FAIL'
           when has_table_privilege('authenticated', 'public.render_jobs', 'select') then 'PASS'
           else 'FAIL' end,
      'GRANT SELECT ke authenticated'),

  (14, 'authenticated TIDAK punya hak tulis render_jobs (insert/update/delete)',
      case when to_regclass('public.render_jobs') is null then 'FAIL'
           when not has_table_privilege('authenticated', 'public.render_jobs', 'insert')
            and not has_table_privilege('authenticated', 'public.render_jobs', 'update')
            and not has_table_privilege('authenticated', 'public.render_jobs', 'delete') then 'PASS'
           else 'FAIL' end,
      'client tidak boleh menulis antrean'),

  (15, 'render_workers TIDAK terbaca client (anon & authenticated)',
      case when to_regclass('public.render_workers') is null then 'FAIL'
           when not has_table_privilege('anon', 'public.render_workers', 'select')
            and not has_table_privilege('authenticated', 'public.render_workers', 'select') then 'PASS'
           else 'FAIL' end,
      'tanda hidup worker hanya untuk service_role'),

  (16, 'service_role punya hak penuh render_jobs (select/insert/update/delete)',
      case when to_regclass('public.render_jobs') is null then 'FAIL'
           when has_table_privilege('service_role', 'public.render_jobs', 'select')
            and has_table_privilege('service_role', 'public.render_jobs', 'insert')
            and has_table_privilege('service_role', 'public.render_jobs', 'update')
            and has_table_privilege('service_role', 'public.render_jobs', 'delete') then 'PASS'
           else 'FAIL' end,
      'worker render memakai service_role'),

  -- ---------------- Fungsi antrean ----------------
  (17, 'Enam fungsi antrean ada di schema public',
      case when (select count(*) from fn) = 6 then 'PASS' else 'FAIL' end,
      (select count(*)::text || '/6 fungsi: ' || coalesce(string_agg(proname, ', ' order by proname), '-')
         from fn)),

  (18, 'Semua fungsi antrean SECURITY DEFINER',
      case when (select count(*) from fn) = 6
            and (select count(*) from fn f2 where not f2.prosecdef) = 0
           then 'PASS' else 'FAIL' end,
      (select count(*)::text || ' fungsi tanpa security definer'
         from fn f2 where not f2.prosecdef)),

  (19, 'Semua fungsi antrean mengunci search_path (proconfig search_path=)',
      case when (select count(*) from fn) = 6
            and (select count(*) from fn f2
                  where not exists (select 1 from unnest(f2.proconfig) cfg
                                     where cfg like 'search_path=%')) = 0
           then 'PASS' else 'FAIL' end,
      (select coalesce(string_agg(f2.proname, ', '), '-')
         from fn f2
        where not exists (select 1 from unnest(f2.proconfig) cfg
                           where cfg like 'search_path=%'))),

  (20, 'anon & authenticated TIDAK punya EXECUTE fungsi antrean',
      case when (select count(*) from fn f2
                  where has_function_privilege('anon', f2.oid, 'execute')
                     or has_function_privilege('authenticated', f2.oid, 'execute')) = 0
           then 'PASS' else 'FAIL' end,
      (select coalesce(string_agg(f2.proname, ', '), '-')
         from fn f2
        where has_function_privilege('anon', f2.oid, 'execute')
           or has_function_privilege('authenticated', f2.oid, 'execute')),

  (21, 'service_role PUNYA EXECUTE semua fungsi antrean',
      case when (select count(*) from fn) = 6
            and (select count(*) from fn f2
                  where not has_function_privilege('service_role', f2.oid, 'execute')) = 0
           then 'PASS' else 'FAIL' end,
      (select coalesce(string_agg(f2.proname, ', '), '-')
         from fn f2
        where not has_function_privilege('service_role', f2.oid, 'execute')),

  -- ---------------- Realtime & indeks ----------------
  (22, 'Publication supabase_realtime ada',
      case when exists (select 1 from pg_publication where pubname = 'supabase_realtime')
           then 'PASS' else 'FAIL' end,
      'dipakai untuk progres render ke browser'),

  (23, 'render_jobs terdaftar di publication supabase_realtime',
      case when exists (select 1 from pg_publication_tables
                         where pubname = 'supabase_realtime'
                           and schemaname = 'public' and tablename = 'render_jobs')
           then 'PASS' else 'FAIL' end,
      coalesce((select string_agg(tablename, ', ' order by tablename)
                  from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'),
               'tidak ada tabel publikasi'),

  (24, 'Indeks klaim & lease ada (render_jobs_claim_idx, render_jobs_lease_idx)',
      case when (select count(*) from pg_indexes
                  where schemaname = 'public' and tablename = 'render_jobs'
                    and indexname in ('render_jobs_claim_idx', 'render_jobs_lease_idx')) = 2
           then 'PASS' else 'FAIL' end,
      (select coalesce(string_agg(indexname, ', ' order by indexname), '-')
         from pg_indexes
        where schemaname = 'public' and tablename = 'render_jobs'
          and indexname in ('render_jobs_claim_idx', 'render_jobs_lease_idx')))
)
select c.no::int          as no,
       c.pemeriksaan::text as pemeriksaan,
       c.hasil::text      as hasil,
       c.detail::text     as detail
  from c

union all

select 999,
       'RINGKASAN: tidak ada pemeriksaan FAIL',
       case when count(*) filter (where c.hasil = 'FAIL') = 0 then 'PASS' else 'FAIL' end,
       count(*) filter (where c.hasil = 'FAIL')::text || ' dari ' || count(*)::text || ' pemeriksaan FAIL'
  from c

 order by 1;
