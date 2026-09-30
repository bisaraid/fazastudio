-- Faza Studio — 031 (Fase 4A / revisi 6A + perbaikan 6A.2): QUERY VERIFIKASI
-- ============================================================
-- Jalankan SETELAH supabase/migrations/031_credit_refund.sql.
--
-- PENTING (revisi 6A): SQL Editor Supabase TIDAK menjaga transaksi lintas
-- statement — tiap "Run" berdiri sendiri. Karena itu file ini TIDAK memakai
-- begin/rollback lintas statement maupun temp table:
--   * Query 1–3 bersifat READ-ONLY.
--   * Query 4 menulis baris uji di SATU blok `do $$ ... $$` dan diakhiri
--     `raise exception` → seluruh isi blok ikut ter-rollback otomatis,
--     tidak ada data uji yang tersisa.
--   * JALANKAN SATU PER SATU: kirim SATU query per Run; jangan digabung
--     dalam satu batch.
-- Jalankan sebagai service_role / postgres (SQL Editor Supabase).
-- Tiap query mencantumkan HARAPAN hasil agar mudah dibandingkan.
--
-- revisi 6A.2 (perbaikan):
--   * Query 2 TIDAK lagi memakai information_schema.routine_privileges — view
--     itu ikut menampilkan PEMILIK fungsi (baris "postgres") sehingga
--     pemeriksaan "hanya service_role" selalu GAGAL. Kini memakai
--     has_function_privilege(), yang menanyakan efektif privilege per-role
--     (anon / authenticated / service_role).
--   * Query 4 memakai `v_sqlstate := sqlstate;` di blok EXCEPTION —
--     RETURNED_SQLSTATE hanya berlaku untuk GET STACKED DIAGNOSTICS.
--   * Query 4 jalur by_user menguji SATU id auth.users yang benar-benar ada
--     (bila ada) dengan period '2099-01' di dalam blok yang ter-rollback;
--     bila auth.users kosong → LEWAT. Tidak ada baris nyata yang tersentuh.
-- ============================================================


-- ============================================================
-- Query 1 — READ-ONLY. Fungsi ada, SECURITY DEFINER, search_path eksplisit,
--           dan signature sesuai pemanggilan kode aplikasi.
--           Jalankan satu per satu (hanya Query 1 ini pada Run pertama).
--     HARAPAN: tepat 2 baris dengan kolom berikut —
--       fungsi           = refund_credit | refund_credit_by_user
--       fungsi_ada       = true (keduanya)
--       argumen          = (p_identity_key text, p_period text, p_idempotency_key text, p_reason text)
--                          (p_user_id uuid, p_period text, p_idempotency_key text, p_reason text)
--       tipe_return      = integer
--       security_definer = true
--       proconfig        = memuat "search_path=public"
-- ============================================================
select n.fungsi,
       (p.oid is not null)                                        as fungsi_ada,
       coalesce(pg_get_function_identity_arguments(p.oid),
                '(FUNGSI TIDAK ADA)')                             as argumen,
       coalesce(pg_get_function_result(p.oid),
                '(FUNGSI TIDAK ADA)')                             as tipe_return,
       coalesce(p.prosecdef, false)                               as security_definer,
       coalesce(array_to_string(p.proconfig, ', '),
                '(kosong)')                                       as proconfig
  from (values ('refund_credit'), ('refund_credit_by_user')) as n(fungsi)
  left join pg_proc p
         on p.proname = n.fungsi
        and p.pronamespace = 'public'::regnamespace
 order by n.fungsi;


-- ============================================================
-- Query 2 — READ-ONLY. Hak eksekusi HANYA service_role pada kedua fungsi;
--           anon & authenticated TIDAK boleh punya hak apa pun.
--           Catatan: TIDAK memakai information_schema.routine_privileges —
--           view tersebut ikut menampilkan PEMILIK fungsi (baris "postgres"),
--           sehingga pemeriksaan "hanya service_role" selalu GAGAL.
--           has_function_privilege() menanyakan efektif privilege per-role,
--           jadi hasilnya akurat.
--           Jalankan satu per satu (Run terpisah dari Query 1).
--     HARAPAN: tepat 2 baris —
--       proname       = refund_credit | refund_credit_by_user
--       anon          = false
--       authenticated = false
--       service_role  = true
--       hasil         = LULUS pada kedua baris
--       (anon / authenticated true → GAGAL: fungsi bisa dipanggil klien;
--        service_role false → GAGAL: aplikasi tidak bisa refund)
-- ============================================================
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role,
       case when not has_function_privilege('anon', p.oid, 'EXECUTE')
                 and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                 and has_function_privilege('service_role', p.oid, 'EXECUTE')
            then 'LULUS'
            else 'GAGAL'
       end                                                       as hasil
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('refund_credit', 'refund_credit_by_user')
 order by p.proname;


-- ============================================================
-- Query 3 — READ-ONLY. Ledger credit_refunds: tabel ada, RLS aktif,
--           tanpa policy (tertutup — hanya service role yang bypass RLS).
--           Jalankan satu per satu (Run terpisah dari Query 2).
--     HARAPAN: tepat 1 baris —
--       tabel_ada = true; rls_aktif = true; policy_count = 0; hasil = LULUS
-- ============================================================
select t.tabel,
       (c.oid is not null)                       as tabel_ada,
       coalesce(c.relrowsecurity, false)         as rls_aktif,
       (select count(*)
          from pg_policies
         where schemaname = 'public'
           and tablename = 'credit_refunds')     as policy_count,
       case when c.oid is not null
                 and coalesce(c.relrowsecurity, false)
                 and not exists (select 1
                                   from pg_policies
                                  where schemaname = 'public'
                                    and tablename = 'credit_refunds')
            then 'LULUS'
            else 'GAGAL'
       end                                        as hasil
  from (values ('credit_refunds')) as t(tabel)
  left join pg_class c
         on c.relname = t.tabel
        and c.relnamespace = 'public'::regnamespace;

-- ============================================================
-- Query 4 — UJI FUNGSI (MENULIS, ter-rollback otomatis di akhir blok).
--           Jalankan satu per satu — kirim HANYA blok ini pada Run terpisah.
--
-- Isi blok (SATU blok `do $$ ... $$`, tanpa begin/rollback perintah transaksi
-- dan tanpa temp table — `begin/exception/end` di bawah adalah blok plpgsql
-- bersarang untuk menangkap exception, BUKAN perintah transaksi):
--   1. sisipkan baris uji user_usage: identity 'anon:__verify031__', period
--      '2099-01' (tidak menyentuh data nyata), semua kolom NOT NULL diisi
--      sesuai skema 003/014/018/028/030, credits_used = 1;
--   2. refund_credit dengan kunci sama DUA KALI → pertama harus 0, kedua -1;
--   3. pastikan credits_used tidak minus (harus 0);
--   4. panggil lagi dengan kunci BARU saat sudah 0 → harapannya exception
--      P0001, ditangkap dengan nested begin/exception;
--   5. uji jalur akun (refund_credit_by_user) memakai SATU id yang
--      benar-benar ada di auth.users (`select id from auth.users order by
--      created_at limit 1`) dengan period '2099-01' (periode uji, tidak
--      dipakai produksi): baris uji (user_id, '2099-01') diperiksa lebih dulu
--      — dicatat "ada"/"tidak ada" — lalu dibersihkan sebelum insert, agar
--      tidak menabrak baris nyata; harapannya pertama = 0, kedua = -1.
--      Bila auth.users kosong (atau tidak terbaca) → catat LEWAT + alasannya,
--      TIDAK menggagalkan blok;
--   6. kumpulkan hasil tiap pemeriksaan sebagai LULUS/GAGAL lalu di akhir
--      `raise exception 'HASIL 031 | ...'` → seluruh blok ter-rollback
--      otomatis, tidak ada data uji tersisa.
--
--     HARAPAN: blok SELALU berakhir dengan ERROR: HASIL 031 | ...
--       Itu SUKSES — pesan error adalah cara mencetak hasil sekaligus
--       mekanisme rollback otomatis. Teks setelah "HASIL 031 |" wajib memuat:
--         refund_pertama(1→0)=LULUS
--         refund_kunci_sama(-1)=LULUS
--         tidak_minus(used=0)=LULUS
--         kunci_baru_p0001=LULUS
--         refund_by_user=LULUS (pertama=0, kedua=-1, baris_lama_2099=…)
--              — ATAU — LEWAT (tidak ada baris auth.users / auth.users tidak
--              terbaca — alasannya ikut tercetak)
--       Semua perubahan (baris uji anon, baris uji akun, ledger refund) berada
--       di dalam blok ini dan ter-rollback oleh `raise exception` di akhir —
--       berapa pun hasilnya, tidak ada baris nyata yang tersisa berubah.
--       Bila balasan BUKAN "HASIL 031 | ..." → ada error nyata di dalam blok
--       (mis. fungsi/tabel belum ada); perbaiki dulu sebelum menyimpulkan.
-- ============================================================
do $$
declare
  v_identity   text    := 'anon:__verify031__';
  v_period     text    := '2099-01';
  v_real_user  uuid;                          -- diisi dari auth.users (bila ada)
  v_alasan_uid text    := 'LEWAT (tidak ada baris auth.users — jalur akun tidak bisa diuji)';
  v_r1         integer;
  v_r2         integer;
  v_used       integer;
  v_ok1        boolean := false;
  v_ok2        boolean := false;
  v_ok3        boolean := false;
  v_ok4        boolean := false;
  v_alasan4    text    := 'tidak ada exception (seharusnya melempar P0001)';
  v_ada_lama   boolean := false;              -- (user_id, '2099-01') sudah ada?
  v_u1         integer;
  v_u2         integer;
  v_hasil_uid  text;
  v_sqlstate   text;
  v_hasil      text;
begin
  -- Bersihkan sisa baris uji bila ada (defensif; ikut ter-rollback bersama blok).
  -- Hanya menyentuh identity uji & period uji '2099-01' di dalam blok ini.
  delete from credit_refunds where idempotency_key like 'verify031:%';
  delete from user_usage
   where identity_key = v_identity
     and period = v_period;

  -- (a) Baris uji anon — semua kolom NOT NULL terisi (003/014/018/028/030);
  --     plan 'free' sehingga trigger expiry (030) tidak mengubah apa pun.
  insert into user_usage (identity_key, period, plan, credits_total, credits_used)
  values (v_identity, v_period, 'free', 10, 1);

  -- (b) Refund pertama: credits_used 1 → 0 ⇒ harus membalas 0.
  v_r1 := refund_credit(v_identity, v_period, 'verify031:idem:v1', 'uji 031');
  v_ok1 := (v_r1 = 0);

  -- (c) Refund kedua dengan kunci yang SAMA: idempoten ⇒ harus membalas -1
  --     dan tidak mengubah credits_used lagi.
  v_r2 := refund_credit(v_identity, v_period, 'verify031:idem:v1', 'uji 031');
  v_ok2 := (v_r2 = -1);

  -- (d) credits_used tidak boleh minus (harus berhenti di 0).
  select credits_used into v_used
    from user_usage
   where identity_key = v_identity
     and period = v_period;
  v_ok3 := (v_used = 0);

  -- (e) Kunci BARU saat credits_used sudah 0 → refund_credit harus melempar
  --     exception P0001 (tidak ada kredit untuk di-refund). begin/exception
  --     bersarang di bawah = penangkap exception plpgsql, bukan transaksi.
  begin
    perform refund_credit(v_identity, v_period, 'verify031:idem:v2', 'uji 031 nol');
    v_ok4 := false; -- tidak boleh sampai sini: seharusnya exception
  exception
    when others then
      -- Di dalam exception handler ini `sqlstate` = SQLSTATE error yang
      -- ditangkap (RETURNED_SQLSTATE hanya untuk GET STACKED DIAGNOSTICS).
      v_sqlstate := sqlstate;
      v_ok4 := (v_sqlstate = 'P0001');
      v_alasan4 := 'SQLSTATE ' || coalesce(v_sqlstate, '?') || ' ' || sqlerrm;
  end;

  -- (f) Jalur refund_credit_by_user — memakai SATU id yang benar-benar ada di
  --     auth.users (bila ada) dengan period '2099-01' (periode uji, tidak
  --     dipakai produksi), sehingga jalur akun ikut teruji.
  --     KEAMANAN DATA NYATA: baris uji (user_id, '2099-01') diperiksa lebih
  --     dulu (dicatat "ada"/"tidak ada"), lalu dibersihkan sebelum insert;
  --     semua perubahan di blok ini ter-rollback oleh `raise exception` di
  --     akhir, sehingga baris sisa (bila ada) tetap utuh setelah Run. Tidak
  --     ada baris produksi (period selain '2099-01') yang disentuh.
  begin
    select u.id into v_real_user
      from auth.users u
     order by u.created_at
     limit 1;
  exception
    when others then
      v_real_user  := null;
      v_sqlstate   := sqlstate;
      v_alasan_uid := 'LEWAT (auth.users tidak terbaca — SQLSTATE '
                   || coalesce(v_sqlstate, '?') || ' ' || sqlerrm || ')';
  end;

  if v_real_user is null then
    -- Tidak ada baris auth.users (mis. DB kosong) → jalur akun tidak bisa diuji.
    v_hasil_uid := v_alasan_uid;
  else
    begin
      -- Periksa dulu apakah (user_id, '2099-01') sudah ada — nilainya ikut
      -- dilaporkan sebagai baris_lama_2099.
      select exists (select 1
                       from user_usage
                      where period = v_period
                        and (user_id = v_real_user
                             or identity_key = 'account:' || v_real_user::text))
        into v_ada_lama;

      -- Bersihkan sisa baris uji period '2099-01' sebelum insert, agar tidak
      -- menabrak baris nyata / unique constraint (identity_key, period).
      delete from user_usage
       where period = v_period
         and (user_id = v_real_user
              or identity_key = 'account:' || v_real_user::text);

      insert into user_usage (user_id, identity_key, period, plan, credits_total, credits_used)
      values (v_real_user, 'account:' || v_real_user::text, v_period, 'free', 10, 1);

      -- Refund pertama 1 → 0 ⇒ harus 0; kedua dengan kunci SAMA ⇒ harus -1.
      v_u1 := refund_credit_by_user(v_real_user, v_period, 'verify031:uidem:v1', 'uji 031');
      v_u2 := refund_credit_by_user(v_real_user, v_period, 'verify031:uidem:v1', 'uji 031');

      v_hasil_uid := case when v_u1 = 0 and v_u2 = -1 then 'LULUS' else 'GAGAL' end
                  || ' (pertama=' || coalesce(v_u1::text, 'null')
                  || ', kedua='    || coalesce(v_u2::text, 'null')
                  || ', baris_lama_2099=' || case when v_ada_lama
                                                  then 'ada→dibersihkan (dipulihkan rollback)'
                                                  else 'tidak ada' end
                  || ', user=' || v_real_user::text || ')';
    exception
      when others then
        v_sqlstate := sqlstate;
        v_hasil_uid := 'GAGAL (SQLSTATE ' || coalesce(v_sqlstate, '?') || ' ' || sqlerrm || ')';
    end;
  end if;

  -- (g) Kumpulkan hasil per pemeriksaan, lalu raise → SELURUH blok ter-rollback
  --     (baris uji user_usage + ledger credit_refunds ikut hilang otomatis).
  v_hasil :=
       'refund_pertama(1→0)='      || case when v_ok1 then 'LULUS' else 'GAGAL' end
    || ' | refund_kunci_sama(-1)=' || case when v_ok2 then 'LULUS' else 'GAGAL' end
    || ' | tidak_minus(used=0)='   || case when v_ok3 then 'LULUS' else 'GAGAL' end
    || ' | kunci_baru_p0001='      || case when v_ok4 then 'LULUS'
                                            else 'GAGAL(' || v_alasan4 || ')' end
    || ' | refund_by_user='        || coalesce(v_hasil_uid, 'GAGAL(tidak terjalankan)');

  raise exception 'HASIL 031 | %', v_hasil;
end;
$$;


