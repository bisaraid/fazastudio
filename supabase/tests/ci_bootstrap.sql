-- ============================================================
-- ci_bootstrap.sql — meniru "kerangka Supabase" di Postgres CI.
--
-- Dipakai .github/workflows/db-tests.yml SEBELUM migrasi dijalankan, supaya
-- migrasi yang bergantung pada lingkungan Supabase tetap bisa jalan di
-- container Postgres biasa:
--   * role anon / authenticated / service_role
--   * schema auth + auth.uid() (membaca request.jwt.claims)
--   * schema storage + tabel minimal storage.buckets (dipakai 013 & 017)
--   * publication supabase_realtime (dipakai 032)
--
-- Idempoten (if not exists / create or replace / guard di dalam blok DO) dan
-- HANYA untuk CI — jangan dijalankan di produksi. Bila objek sudah ada
-- (mis. image supabase/postgres yang lengkap), langkah ini praktis no-op.
-- ============================================================

-- ---------------- 1. Schema dasar ----------------
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

-- ---------------- 2. Role Supabase ----------------
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit', r);
      raise notice 'ci_bootstrap: role % dibuat', r;
    end if;
  end loop;

  -- service_role harus melewati RLS (sama seperti Supabase cloud).
  begin
    if exists (select 1 from pg_roles where rolname = 'service_role' and not rolbypassrls) then
      execute 'alter role service_role bypassrls';
    end if;
  exception when others then
    raise warning 'ci_bootstrap: BYPASSRLS service_role dilewati (SQLSTATE %)', sqlstate;
  end;

  -- Sesi uji harus bisa SET ROLE anon/authenticated/service_role (uji T7/T8).
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    begin
      if not pg_has_role(current_user, r, 'member') then
        execute format('grant %I to %I', r, current_user);
        raise notice 'ci_bootstrap: grant % -> %', r, current_user;
      end if;
    exception when others then
      raise warning 'ci_bootstrap: grant % ke % dilewati (SQLSTATE %)', r, current_user, sqlstate;
    end;
  end loop;
end $$;

-- ---------------- 3. auth.uid() (definisi sama seperti Supabase) ----------------
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(coalesce(
           nullif(current_setting('request.jwt.claim.sub', true), ''),
           (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
         ), '')::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- ---------------- 4. auth.users minimal (target FK migrasi 007/008/011/015) ----------------
create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  created_at timestamptz not null default now()
);

-- ---------------- 5. storage.buckets minimal (dipakai 013 & 017) ----------------
create table if not exists storage.buckets (
  id         text primary key,
  name       text not null,
  public     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------- 6. Publication supabase_realtime (dipakai 032) ----------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'create publication supabase_realtime with (publish = ''insert,update,delete'')';
      raise notice 'ci_bootstrap: publication supabase_realtime dibuat';
    exception when others then
      raise warning 'ci_bootstrap: gagal membuat publication supabase_realtime (SQLSTATE % — wal_level?)',
        sqlstate;
    end;
  end if;
end $$;

-- ---------------- 7. Diagnostik (terlihat di log CI) ----------------
select current_user                    as ci_bootstrap_oleh,
       current_setting('server_version') as versi_postgres,
       current_setting('wal_level')      as wal_level;

select rolname, rolsuper, rolbypassrls, rolcanlogin
  from pg_roles
 where rolname in ('anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin')
 order by rolname;

select pubname, pubinsert, pubupdate, pubdelete
  from pg_publication
 order by pubname;
