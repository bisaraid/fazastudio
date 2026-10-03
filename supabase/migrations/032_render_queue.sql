-- ============================================================
-- 032_render_queue.sql — Antrean render berbasis Postgres
-- (menggantikan BullMQ + Redis/Upstash; biaya $0)
--
-- Dasar: docs/ARCH_AUDIT.md §2 (desain tabel & fungsi).
-- JALAN DI STAGING (supabase start lokal) — BUKAN produksi.
-- Idempoten (if not exists / or replace) → aman diulang.
-- ============================================================

-- ---------------- Tabel job ----------------
create table if not exists public.render_jobs (
  id                text primary key,          -- 'render:<projectId>:<ts>' (format jobId lama)
  project_id        text not null,
  identity_key      text not null,
  user_id           uuid,                      -- pemilik (RLS: hanya dia yang boleh baca)
  payload           jsonb not null,            -- RenderJobData (worker/src/queue.ts:82-104)
  status            text not null default 'queued'
                    check (status in ('queued','active','done','failed','canceled')),
  progress          numeric not null default 0 check (progress between 0 and 100),
  error             text,
  attempts          int not null default 0,
  max_attempts      int not null default 2,    -- = BullMQ attempts:2 (queue.ts:139)
  available_at      timestamptz not null default now(),   -- slot retry (backoff)
  locked_by         text,                      -- worker id (hostname:pid)
  locked_at         timestamptz,
  lease_expires_at  timestamptz,               -- kedaluwarsa = worker mati
  heartbeat_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  finished_at       timestamptz
);

-- ---------------- Tabel tanda hidup worker ----------------
create table if not exists public.render_workers (
  id            text primary key,              -- hostname:pid[:suffix]
  label         text,
  backend       text not null default 'supabase',
  last_seen_at  timestamptz not null default now()
);

-- ---------------- Indeks (satu per statement) ----------------
create index if not exists render_jobs_claim_idx
  on public.render_jobs (available_at) where status = 'queued';
create index if not exists render_jobs_lease_idx
  on public.render_jobs (lease_expires_at) where status = 'active';
create index if not exists render_jobs_reuse_idx
  on public.render_jobs (project_id, created_at desc)
  where status in ('queued','active');
create index if not exists render_jobs_project_idx
  on public.render_jobs (project_id, created_at desc);
create index if not exists render_jobs_cleanup_idx
  on public.render_jobs (finished_at) where finished_at is not null;

-- ---------------- RLS ----------------
alter table public.render_jobs enable row level security;
alter table public.render_workers enable row level security;

-- Client biasa: TIDAK ADA hak tulis sama sekali; hanya SELECT job milik sendiri.
revoke all on table public.render_jobs from anon, authenticated;
grant select on table public.render_jobs to authenticated;
grant all on table public.render_jobs to service_role;

revoke all on table public.render_workers from anon, authenticated;
revoke select on table public.render_workers from anon, authenticated;
grant all on table public.render_workers to service_role;

drop policy if exists "select_own_job" on public.render_jobs;
create policy "select_own_job" on public.render_jobs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- render_workers: tanpa policy → client biasa tidak bisa membaca/menulis
-- (web membaca last_seen_at memakai service_role).

-- ---------------- Realtime (progres ke browser) ----------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename  = 'render_jobs'
     ) then
    execute 'alter publication supabase_realtime add table public.render_jobs';
  end if;
end $$;

-- ============================================================
-- FUNGSI ANTREAN (SECURITY DEFINER; search_path dikosongkan → referensi penuh)
-- ============================================================

-- Ambil SATU job secara atomik. Dua sesi bersamaan tidak pernah mendapat job
-- sama (FOR UPDATE SKIP LOCKED). Job lease kedaluwarsa dipulihkan TANPA
-- melebihi max_attempts, dan job yang langsung di-failed TIDAK dikembalikan.
create or replace function public.claim_render_job(
  p_worker text, p_lease_sec int default 90)
returns setof public.render_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.render_jobs;
begin
  loop
    select * into r
      from public.render_jobs
     where (status = 'queued' and available_at <= now())
        or (status = 'active' and lease_expires_at is not null
                           and lease_expires_at < now())
     order by available_at, id                 -- tiebreak deterministik (uji & keadilan)
       for update skip locked
     limit 1;

    if not found then
      return;                                  -- antrean kosong
    end if;

    if r.status = 'active' then
      -- Lease kedaluwarsa (PC mati di tengah render):
      if r.attempts >= r.max_attempts then
        -- Tidak boleh melebihi max_attempts → gagal permanen.
        update public.render_jobs
           set status = 'failed',
               error = coalesce(r.error, 'lease kedaluwarsa: worker mati'),
               finished_at = now(), updated_at = now(),
               locked_by = null, locked_at = null, lease_expires_at = null
         where id = r.id;
        continue;                              -- JANGAN kembalikan sebagai pekerjaan
      end if;

      -- Masih ada kesempatan → kembalikan ke antrean (terlihat 'queued'),
      -- iterasi berikutnya memilih kandidat terbaik (bisa job lain).
      update public.render_jobs
         set status = 'queued',
             locked_by = null, locked_at = null, lease_expires_at = null,
             available_at = now(), updated_at = now(),
             error = coalesce(r.error, 'lease kedaluwarsa: worker mati; diulang')
       where id = r.id;
      continue;
    end if;

    -- 'queued' → klaim sah
    update public.render_jobs
       set status = 'active',
           locked_by = p_worker,
           locked_at = now(),
           heartbeat_at = now(),
           lease_expires_at = now() + make_interval(secs => p_lease_sec),
           attempts = attempts + 1,
           error = null,
           updated_at = now()
     where id = r.id
     returning * into r;

    return next r;
    return;
  end loop;
end;
$$;

-- Perpanjang lease + naikkan progress (hanya milik worker yang mengklaim).
create or replace function public.heartbeat_render_job(
  p_id text, p_worker text,
  p_progress numeric default null,
  p_lease_sec int default 90)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare ok int;
begin
  update public.render_jobs
     set heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_sec),
         progress = case
                      when p_progress is null then progress
                      else least(100, greatest(progress, p_progress))
                    end,
         updated_at = now()
   where id = p_id
     and locked_by = p_worker
     and status = 'active';
  get diagnostics ok = row_count;
  return ok > 0;
end;
$$;

-- Selesai sukses.
create or replace function public.complete_render_job(p_id text, p_worker text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare ok int;
begin
  update public.render_jobs
     set status = 'done', progress = 100,
         finished_at = now(), updated_at = now(),
         lease_expires_at = null, locked_by = null, locked_at = null
   where id = p_id and locked_by = p_worker and status = 'active';
  get diagnostics ok = row_count;
  return ok > 0;
end;
$$;

-- Gagal: retry dengan backoff eksponensial (5s → 10s → …) selama attempts
-- masih di bawah max_attempts; selain itu gagal permanen.
create or replace function public.fail_render_job(
  p_id text, p_worker text, p_error text, p_backoff_base_sec int default 5)
returns setof public.render_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare r public.render_jobs;
begin
  select * into r
    from public.render_jobs
   where id = p_id and locked_by = p_worker and status = 'active'
     for update;
  if not found then
    return;                                    -- bukan milik worker ini
  end if;

  if r.attempts < r.max_attempts then
    update public.render_jobs
       set status = 'queued',
           locked_by = null, locked_at = null, lease_expires_at = null,
           available_at = now() + make_interval(
             secs => p_backoff_base_sec * power(2, r.attempts - 1)),
           error = p_error,
           updated_at = now()
     where id = p_id
     returning * into r;
  else
    update public.render_jobs
       set status = 'failed',
           error = p_error,
           finished_at = now(), updated_at = now(),
           locked_by = null, locked_at = null, lease_expires_at = null
     where id = p_id
     returning * into r;
  end if;

  return next r;
end;
$$;

-- Daftar job yang MASIH hidup — sumber data guard reuse (REL-06).
create or replace function public.pick_pending_jobs(
  p_project_id text default null, p_limit int default 100)
returns setof public.render_jobs
language sql
security definer
set search_path = ''
as $$
  select * from public.render_jobs
   where status in ('queued','active')
     and created_at > now() - interval '15 minutes'
     and (p_project_id is null or project_id = p_project_id)
   order by created_at desc
   limit p_limit;
$$;

-- Pembersihan: retensi job selesai (7 hari, meniru removeOnFail) dan job
-- queued yang tak pernah diambil (worker mati > 24 jam) → failed.
create or replace function public.cleanup_render_jobs(p_retention_days int default 7)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  delete from public.render_jobs
   where finished_at is not null
     and finished_at < now() - make_interval(days => p_retention_days);
  get diagnostics n = row_count;

  update public.render_jobs
     set status = 'failed',
         error = 'kedaluwarsa: worker tidak pernah mengambil job (> 24 jam)',
         finished_at = now(), updated_at = now()
   where status = 'queued'
     and created_at < now() - interval '24 hours';

  return n;
end;
$$;

-- ============================================================
-- KEAMANAN FUNGSI: hanya service_role yang boleh mengeksekusi.
-- ============================================================

-- Kepemilikan: SECURITY DEFINER harus benar-benar melewati RLS. Bila role yang
-- menjalankan migrasi (postgres) tidak superuser/bypassrls, alihkan kepemilikan
-- ke service_role (yang wajib punya BYPASSRLS di Supabase).
do $$
declare fn text;
begin
  if exists (select 1 from pg_roles
              where rolname = 'postgres' and not rolsuper and not rolbypassrls)
     and exists (select 1 from pg_roles
                  where rolname = 'service_role' and rolbypassrls)
     and pg_has_role(current_user, 'service_role', 'member') then
    foreach fn in array array[
      'public.claim_render_job(text,integer)',
      'public.heartbeat_render_job(text,text,numeric,integer)',
      'public.complete_render_job(text,text)',
      'public.fail_render_job(text,text,text,integer)',
      'public.pick_pending_jobs(text,integer)',
      'public.cleanup_render_jobs(integer)'
    ] loop
      execute format('alter function %s owner to service_role', fn);
    end loop;
  end if;
end $$;

-- REVOKE dari public/anon/authenticated + GRANT hanya ke service_role.
revoke execute on function public.claim_render_job(text, integer)
  from public, anon, authenticated;
revoke execute on function public.heartbeat_render_job(text, text, numeric, integer)
  from public, anon, authenticated;
revoke execute on function public.complete_render_job(text, text)
  from public, anon, authenticated;
revoke execute on function public.fail_render_job(text, text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.pick_pending_jobs(text, integer)
  from public, anon, authenticated;
revoke execute on function public.cleanup_render_jobs(integer)
  from public, anon, authenticated;

grant execute on function public.claim_render_job(text, integer)
  to service_role;
grant execute on function public.heartbeat_render_job(text, text, numeric, integer)
  to service_role;
grant execute on function public.complete_render_job(text, text)
  to service_role;
grant execute on function public.fail_render_job(text, text, text, integer)
  to service_role;
grant execute on function public.pick_pending_jobs(text, integer)
  to service_role;
grant execute on function public.cleanup_render_jobs(integer)
  to service_role;
