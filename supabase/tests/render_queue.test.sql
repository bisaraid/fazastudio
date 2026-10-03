-- ============================================================
-- render_queue.test.sql — Tes SQL untuk migrasi 032_render_queue.sql
-- TARGET: DB staging/uji (container lokal atau service container CI). BUKAN produksi.
-- Jalankan lewat:  node supabase/tests/render_queue.test.mjs
-- Atau manual   :  psql -v ON_ERROR_STOP=1 -f supabase/tests/render_queue.test.sql
-- Gagal = memunculkan exception (psql exit != 0).
-- ============================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset null 'NULL'

-- ---------- 0. Bersihkan data uji sebelumnya ----------
-- Dijalankan sebagai user sesi (pemilik tabel): RLS tidak menghalangi pemilik,
-- sehingga tes tidak bergantung pada keanggotaan role service_role.
-- CATATAN ISOLASI: tiap blok uji (T2–T8 + seed T9) membersihkan tabel lebih
-- dulu, karena claim_render_job memilih kandidat tertua (available_at, id) —
-- sisa baris dari blok sebelumnya akan mengacaukan urutan klaim.
delete from public.render_jobs;
truncate public.render_workers;

-- ---------- T1. IDEMPOTENSI: id duplikat DITOLAK ----------
do $$
begin
  insert into public.render_jobs (id, project_id, identity_key, payload)
  values ('dup-1', 'p-dup', 'ik-dup', '{"synthetic":true}'::jsonb);

  begin
    insert into public.render_jobs (id, project_id, identity_key, payload)
    values ('dup-1', 'p-dup', 'ik-dup', '{}'::jsonb);
    raise exception 'GAGAL T1: id duplikat diterima';
  exception when unique_violation then
    raise notice 'OK T1 — id duplikat ditolak (unique_violation)';
  end;

  if (select count(*) from public.render_jobs where id = 'dup-1') <> 1 then
    raise exception 'GAGAL T1: jumlah baris dup-1 <> 1';
  end if;
  delete from public.render_jobs where id = 'dup-1';   -- bersihkan (isolasi blok T2)
end $$;

-- ---------- T2. CLAIM + RETRY: backoff 5s lalu 10s, lalu failed ----------
do $$
declare j public.render_jobs;
  d5 numeric; d10 numeric;
begin
  -- Isolasi: tabel ini DB uji — pastikan hanya baris milik blok ini yang ada
  -- (klaim memilih kandidat tertua: available_at lalu id), agar hasil tes
  -- tidak bergantung pada sisa blok sebelumnya.
  delete from public.render_jobs;
  -- max_attempts=3 khusus uji (formula backoff sama; default produksi tetap 2)
  insert into public.render_jobs (id, project_id, identity_key, payload, max_attempts)
  values ('bk-1', 'p-bk', 'ik-bk', '{"synthetic":true}'::jsonb, 3);

  select * into j from public.claim_render_job('w-bk', 90);
  if j.id is null or j.id <> 'bk-1' or j.attempts <> 1 or j.status <> 'active' then
    raise exception 'GAGAL T2: claim pertama (attempts=1, active), dapat %', coalesce(j.id,'NULL');
  end if;

  -- fail percobaan ke-1 → backoff 5 detik (5 * 2^0)
  select * into j from public.fail_render_job('bk-1', 'w-bk', 'err-1');
  if j.status <> 'queued' then
    raise exception 'GAGAL T2: setelah fail 1 status=% (queued)', j.status;
  end if;
  select extract(epoch from (j.available_at - now())) into d5;
  if d5 < 4.5 or d5 > 6.5 then
    raise exception 'GAGAL T2: backoff pertama = % dtk (harus ~5)', d5;
  end if;

  -- Backoff belum selesai → claim tidak boleh mengambil apa pun
  if (select count(*) from public.claim_render_job('w-bk')) <> 0 then
    raise exception 'GAGAL T2: job masih di-backoff tapi berhasil diambil';
  end if;
  raise notice 'OK T2a — backoff pertama ~5s dan menghambat klaim';

  -- Majukan waktu uji saja (simulasi lewatnya backoff)
  update public.render_jobs set available_at = now() where id = 'bk-1';

  select * into j from public.claim_render_job('w-bk', 90);
  if j.id is null or j.attempts <> 2 then
    raise exception 'GAGAL T2: claim ke-2 attempts=% (harus 2)', coalesce(j.attempts, -1);
  end if;

  -- fail percobaan ke-2 → backoff 10 detik (5 * 2^1)
  select * into j from public.fail_render_job('bk-1', 'w-bk', 'err-2');
  if j.status <> 'queued' then
    raise exception 'GAGAL T2: setelah fail 2 status=% (queued)', j.status;
  end if;
  select extract(epoch from (j.available_at - now())) into d10;
  if d10 < 9.5 or d10 > 11.5 then
    raise exception 'GAGAL T2: backoff kedua = % dtk (harus ~10)', d10;
  end if;
  raise notice 'OK T2b — backoff kedua ~10s';

  update public.render_jobs set available_at = now() where id = 'bk-1';
  select * into j from public.claim_render_job('w-bk', 90);
  if j.attempts <> 3 then
    raise exception 'GAGAL T2: claim ke-3 attempts=% (harus 3)', j.attempts;
  end if;

  -- Percobaan ke-3 = batas → gagal permanen
  select * into j from public.fail_render_job('bk-1', 'w-bk', 'err-3');
  if j.status <> 'failed' or j.finished_at is null then
    raise exception 'GAGAL T2: akhir status=% (harus failed)', j.status;
  end if;
  if (select count(*) from public.claim_render_job('w-bk')) <> 0 then
    raise exception 'GAGAL T2: job failed masih bisa diklaim';
  end if;
  raise notice 'OK T2c — percobaan ke-3 diakhiri failed (max_attempts terjaga)';
end $$;

-- ---------- T3. WORKER MATI: lease kedaluwarsa → queued, lalu failed ----------
do $$
declare j public.render_jobs; got text; st text; att int;
begin
  delete from public.render_jobs;                 -- isolasi blok T3
  insert into public.render_jobs (id, project_id, identity_key, payload)
  values ('lease-a', 'p-l', 'ik-l', '{"synthetic":true}'::jsonb);
  insert into public.render_jobs (id, project_id, identity_key, payload)
  values ('lease-b', 'p-l', 'ik-l', '{"synthetic":true}'::jsonb);

  select * into j from public.claim_render_job('w1', 90);
  if j.id <> 'lease-a' or j.attempts <> 1 then
    raise exception 'GAGAL T3: klaim awal dapat % (harus lease-a)', coalesce(j.id,'NULL');
  end if;

  -- Simulasi PC mati: lease habis
  update public.render_jobs set lease_expires_at = now() - interval '1 second'
   where id = 'lease-a';

  -- Klaim berikutnya: lease-a DIPULIHKAN ke 'queued' (bukan langsung diambil),
  -- lalu w2 mendapat lease-b (kandidat queued yang lebih tua).
  select id into got from public.claim_render_job('w2', 90);
  if got is null or got <> 'lease-b' then
    raise exception 'GAGAL T3: klaim pasca-lease dapat % (harus lease-b)', coalesce(got,'NULL');
  end if;
  select status into st from public.render_jobs where id = 'lease-a';
  if st <> 'queued' then
    raise exception 'GAGAL T3: lease-a status=% setelah lease habis (harus queued)', st;
  end if;
  raise notice 'OK T3a — setelah lease habis job kembali queued';

  select * into j from public.claim_render_job('w3', 90);
  if j.id <> 'lease-a' or j.attempts <> 2 or j.status <> 'active' then
    raise exception 'GAGAL T3: recovery klaim id=% attempts=% (harus lease-a / 2)',
      coalesce(j.id,'NULL'), coalesce(j.attempts,-1);
  end if;

  -- Mati lagi, padahal attempts sudah = max_attempts (2)
  update public.render_jobs set lease_expires_at = now() - interval '1 second'
   where id = 'lease-a';

  if (select count(*) from public.claim_render_job('w4', 90)) <> 0 then
    raise exception 'GAGAL T3: job melewati max_attempts masih DIKEMBALIKAN sebagai pekerjaan';
  end if;
  select status, attempts into st, att from public.render_jobs where id = 'lease-a';
  if st <> 'failed' then
    raise exception 'GAGAL T3: status akhir=% (harus failed)', st;
  end if;
  if att > 2 then
    raise exception 'GAGAL T3: attempts=% melebihi max_attempts=2', att;
  end if;
  raise notice 'OK T3b — lease habis ke-2 → failed, tidak dikembalikan, attempts <= max';

  perform public.complete_render_job('lease-b', 'w2');
  delete from public.render_jobs where id in ('lease-a','lease-b');
end $$;

-- ---------- T4. OWNERSHIP: heartbeat/complete/fail hanya oleh pemilik ----------
do $$
declare ok boolean; j public.render_jobs;
begin
  delete from public.render_jobs;                 -- isolasi blok T4
  insert into public.render_jobs (id, project_id, identity_key, payload)
  values ('own-1', 'p-o', 'ik-o', '{"synthetic":true}'::jsonb);
  perform public.claim_render_job('wA', 90);

  if public.heartbeat_render_job('own-1', 'wB', 50) then
    raise exception 'GAGAL T4: heartbeat oleh worker asing (wB) diterima';
  end if;
  if not public.heartbeat_render_job('own-1', 'wA', 40) then
    raise exception 'GAGAL T4: heartbeat oleh pemilik (wA) ditolak';
  end if;
  select * into j from public.render_jobs where id = 'own-1';
  if j.progress <> 40 or j.heartbeat_at is null or j.lease_expires_at <= now() then
    raise exception 'GAGAL T4: heartbeat tidak memperbarui progress/lease';
  end if;

  if public.complete_render_job('own-1', 'wB') then
    raise exception 'GAGAL T4: complete oleh worker asing (wB) diterima';
  end if;
  if (select count(*) from public.fail_render_job('own-1', 'wB', 'x')) <> 0 then
    raise exception 'GAGAL T4: fail oleh worker asing (wB) diterima';
  end if;

  if not public.complete_render_job('own-1', 'wA') then
    raise exception 'GAGAL T4: complete oleh pemilik (wA) ditolak';
  end if;
  select status, progress into j.status, j.progress
    from public.render_jobs where id = 'own-1';
  if j.status <> 'done' or j.progress <> 100 then
    raise exception 'GAGAL T4: status=% progress=% (harus done/100)', j.status, j.progress;
  end if;
  raise notice 'OK T4 — heartbeat/complete/fail terkunci pada locked_by';
  delete from public.render_jobs where id = 'own-1';
end $$;

-- ---------- T5. pick_pending_jobs (data guard reuse REL-06) ----------
do $$
declare n int;
begin
  delete from public.render_jobs;                 -- isolasi blok T5
  insert into public.render_jobs (id, project_id, identity_key, payload)
  values ('reuse-1', 'p-r', 'ik-r', '{"audioUrl":"a","subtitleUrl":"s"}'::jsonb);
  insert into public.render_jobs (id, project_id, identity_key, payload, created_at)
  values ('reuse-old', 'p-r', 'ik-r', '{}'::jsonb, now() - interval '16 minutes');
  insert into public.render_jobs (id, project_id, identity_key, payload, status)
  values ('reuse-done', 'p-r', 'ik-r', '{}', 'done');

  select count(*) into n from public.pick_pending_jobs('p-r');
  if n <> 1 then
    raise exception 'GAGAL T5: pick_pending_jobs(p-r) = % (harus 1)', n;
  end if;
  if (select id from public.pick_pending_jobs('p-r') limit 1) <> 'reuse-1' then
    raise exception 'GAGAL T5: job yang dikembalikan salah';
  end if;
  raise notice 'OK T5 — pick_pending_jobs hanya job hidup <15 menit';
  delete from public.render_jobs where id like 'reuse-%';
end $$;

-- ---------- T6. cleanup_render_jobs ----------
do $$
declare n int; sisa int;
begin
  delete from public.render_jobs;                 -- isolasi blok T6
  insert into public.render_jobs (id, project_id, identity_key, payload, status, finished_at)
  values ('old-done', 'p-c', 'ik-c', '{}', 'done', now() - interval '8 days');
  insert into public.render_jobs (id, project_id, identity_key, payload, created_at)
  values ('stale-queued', 'p-c', 'ik-c', '{}', now() - interval '25 hours');

  select cleanup_render_jobs(7) into n;
  if n < 1 then
    raise exception 'GAGAL T6: tidak ada job selesai yang dibersihkan (n=%)', n;
  end if;
  if (select count(*) from public.render_jobs where id = 'old-done') <> 0 then
    raise exception 'GAGAL T6: job selesai 8 hari tidak dihapus';
  end if;
  select count(*) into sisa
    from public.render_jobs where id = 'stale-queued' and status = 'failed';
  if sisa <> 1 then
    raise exception 'GAGAL T6: queued >24 jam tidak menjadi failed';
  end if;
  raise notice 'OK T6 — cleanup (retensi 7 hari + queued kedaluwarsa)';
  delete from public.render_jobs where id in ('old-done','stale-queued');
end $$;

-- ---------- T7. REALTIME + HAK (katalog) ----------
do $$
declare fn text;
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'render_jobs'
  ) then
    raise exception 'GAGAL T7: render_jobs tidak ada di publication supabase_realtime';
  end if;
  raise notice 'OK T7a — render_jobs masuk publication supabase_realtime';

  -- Fungsi: hanya service_role
  if has_function_privilege('anon', 'public.claim_render_job(text,integer)', 'execute') then
    raise exception 'GAGAL T7: anon masih punya EXECUTE claim_render_job';
  end if;
  if has_function_privilege('authenticated', 'public.claim_render_job(text,integer)', 'execute') then
    raise exception 'GAGAL T7: authenticated masih punya EXECUTE claim_render_job';
  end if;
  if not has_function_privilege('service_role', 'public.claim_render_job(text,integer)', 'execute') then
    raise exception 'GAGAL T7: service_role tanpa EXECUTE claim_render_job';
  end if;
  foreach fn in array array[
    'public.heartbeat_render_job(text,text,numeric,integer)',
    'public.complete_render_job(text,text)',
    'public.fail_render_job(text,text,text,integer)',
    'public.pick_pending_jobs(text,integer)',
    'public.cleanup_render_jobs(integer)'
  ] loop
    if has_function_privilege('anon', fn, 'execute')
       or has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'GAGAL T7: fungsi % masih bisa dieksekui anon/authenticated', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'execute') then
      raise exception 'GAGAL T7: service_role kehilangan EXECUTE %', fn;
    end if;
  end loop;
  raise notice 'OK T7b — EXECUTE fungsi hanya service_role';

  -- Tabel: client biasa tidak punya hak tulis
  if has_table_privilege('anon', 'public.render_jobs', 'select')
     or has_table_privilege('anon', 'public.render_jobs', 'insert')
     or has_table_privilege('authenticated', 'public.render_jobs', 'insert')
     or has_table_privilege('authenticated', 'public.render_jobs', 'update')
     or has_table_privilege('authenticated', 'public.render_jobs', 'delete') then
    raise exception 'GAGAL T7: client biasa masih punya hak tulis/baca tak terbatas';
  end if;
  if not has_table_privilege('authenticated', 'public.render_jobs', 'select') then
    raise exception 'GAGAL T7: authenticated kehilangan SELECT render_jobs';
  end if;
  if has_table_privilege('authenticated', 'public.render_workers', 'select')
     or has_table_privilege('anon', 'public.render_workers', 'select') then
    raise exception 'GAGAL T7: render_workers bisa dibaca client biasa';
  end if;
  raise notice 'OK T7c — tabel: client biasa hanya SELECT render_jobs, tanpa tulis';
end $$;

-- ---------- T8. PERILAKU ROLE LAIN (anon / authenticated) ----------
reset role;                                 -- kembali ke session user (postgres)

-- Data uji RLS (bersihkan dulu → hanya rls-a/rls-b yang ada)
delete from public.render_jobs;
insert into public.render_jobs (id, project_id, identity_key, payload, user_id)
values ('rls-a', 'p-rls', 'ik-a', '{"synthetic":true}'::jsonb,
        '11111111-1111-1111-1111-111111111111');
insert into public.render_jobs (id, project_id, identity_key, payload, user_id)
values ('rls-b', 'p-rls', 'ik-b', '{"synthetic":true}'::jsonb,
        '22222222-2222-2222-2222-222222222222');

-- ===== T8a-c: ANON ditolak =====
set role anon;
do $$
begin
  begin
    perform public.claim_render_job('x');
    raise exception 'GAGAL T8a: anon bisa memanggil claim_render_job';
  exception when insufficient_privilege then
    raise notice 'OK T8a — anon DITOLAK memanggil fungsi antrean';
  end;
  begin
    insert into public.render_jobs (id, project_id, identity_key, payload)
    values ('anon-x', 'p', 'i', '{}'::jsonb);
    raise exception 'GAGAL T8b: anon bisa menulis render_jobs';
  exception when insufficient_privilege then
    raise notice 'OK T8b — anon DITOLAK menulis render_jobs';
  end;
  begin
    perform count(*) from public.render_jobs;
    raise exception 'GAGAL T8c: anon bisa membaca render_jobs';
  exception when insufficient_privilege then
    raise notice 'OK T8c — anon DITOLAK membaca render_jobs';
  end;
end $$;
reset role;

-- ===== T8d-h: authenticated hanya baca milik sendiri =====
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
declare n int;
begin
  begin
    insert into public.render_jobs (id, project_id, identity_key, payload)
    values ('auth-x', 'p', 'i', '{}'::jsonb);
    raise exception 'GAGAL T8d: authenticated bisa INSERT';
  exception when insufficient_privilege then
    raise notice 'OK T8d — authenticated DITOLAK menulis (INSERT)';
  end;
  begin
    update public.render_jobs set progress = 0 where id = 'rls-a';
    raise exception 'GAGAL T8e: authenticated bisa UPDATE';
  exception when insufficient_privilege then
    raise notice 'OK T8e — authenticated DITOLAK menulis (UPDATE)';
  end;
  begin
    delete from public.render_jobs where id = 'rls-a';
    raise exception 'GAGAL T8f: authenticated bisa DELETE';
  exception when insufficient_privilege then
    raise notice 'OK T8f — authenticated DITOLAK menulis (DELETE)';
  end;
  begin
    perform public.claim_render_job('x');
    raise exception 'GAGAL T8g: authenticated bisa memanggil fungsi antrean';
  exception when insufficient_privilege then
    raise notice 'OK T8g — authenticated DITOLAK memanggil fungsi antrean';
  end;

  select count(*) into n from public.render_jobs where id = 'rls-a';
  if n <> 1 then
    raise exception 'GAGAL T8h: authenticated tidak bisa baca job miliknya (n=%)', n;
  end if;
  select count(*) into n from public.render_jobs where id = 'rls-b';
  if n <> 0 then
    raise exception 'GAGAL T8i: authenticated bisa membaca job MILIK ORANG LAIN';
  end if;
  raise notice 'OK T8h/i — authenticated hanya membaca job milik sendiri';
end $$;
reset role;

-- ---------- 9. Bersihkan data uji ----------
delete from public.render_jobs;
truncate public.render_workers;

\echo 'SEMUA TES SQL LULUS'




