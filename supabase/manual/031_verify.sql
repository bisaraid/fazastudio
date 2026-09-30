-- Faza Studio — 031 (Fase 4A / revisi 6A): QUERY VERIFIKASI
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
-- Query 2 — READ-ONLY. Grant eksekusi HANYA service_role pada kedua fungsi;
--           anon/authenticated/public TIDAK boleh punya hak apa pun.
--           Jalankan satu per satu (Run terpisah dari Query 1).
--     HARAPAN: tepat 2 baris —
--       grantee_list = hanya memuat "service_role"
--       hasil        = LULUS pada kedua baris
--       (bila memuat anon / authenticated / public / PUBLIC → GAGAL;
--        bila "(tidak ada grant)" → GAGAL karena service_role ikut hilang)
-- ============================================================
select n.fungsi,
       coalesce(string_agg(distinct p.grantee, ', ' order by p.grantee),
                '(tidak ada grant)')                                   as grantee_list,
       case
         when coalesce(bool_or(upper(p.grantee) = 'SERVICE_ROLE'
                               and p.privilege_type = 'EXECUTE'), false)
          and not coalesce(bool_or(upper(p.grantee) <> 'SERVICE_ROLE'), false)
           then 'LULUS'
           else 'GAGAL'
       end                                                             as hasil
  from (values ('refund_credit'), ('refund_credit_by_user')) as n(fungsi)
  left join information_schema.routine_privileges p
         on p.routine_schema = 'public'
        and p.routine_name = n.fungsi
 group by n.fungsi
 order by n.fungsi;


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
--   5. uji refund_credit_by_user; bila skema mewajibkan baris auth.users
--      nyata (FK dari 008_user_id.sql) → tulis alasannya dan LEWAT;
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
--         refund_by_user=LULUS (pertama=0, kedua=-1)
--              — ATAU — LEWAT (butuh baris auth.users nyata ... SQLSTATE 23503)
--       Bila balasan BUKAN "HASIL 031 | ..." → ada error nyata di dalam blok
--       (mis. fungsi/tabel belum ada); perbaiki dulu sebelum menyimpulkan.
-- ============================================================
do $$
declare
  v_identity   text    := 'anon:__verify031__';
  v_period     text    := '2099-01';
  v_test_user  uuid    := gen_random_uuid();
  v_r1         integer;
  v_r2         integer;
  v_used       integer;
  v_ok1        boolean := false;
  v_ok2        boolean := false;
  v_ok3        boolean := false;
  v_ok4        boolean := false;
  v_alasan4    text    := 'tidak ada exception (seharusnya melempar P0001)';
  v_user_row   boolean := false;
  v_u1         integer;
  v_u2         integer;
  v_hasil_uid  text;
  v_sqlstate   text;
  v_hasil      text;
begin
  -- Bersihkan sisa baris uji bila ada (defensif; ikut ter-rollback bersama blok).
  delete from credit_refunds where idempotency_key like 'verify031:%';
  delete from user_usage
   where identity_key = v_identity
      or identity_key = 'account:' || v_test_user::text;

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
      get diagnostics v_sqlstate = returned_sqlstate;
      v_ok4 := (v_sqlstate = 'P0001');
      v_alasan4 := 'SQLSTATE ' || coalesce(v_sqlstate, '?') || ' ' || sqlerrm;
  end;

  -- (f) Jalur refund_credit_by_user. user_usage.user_id memiliki FK →
  --     auth.users(id) (008_user_id.sql), sehingga baris uji dengan uuid
  --     acak ditolak skema (23503). Bila skema mengizinkan (tanpa FK), uji
  --     penuh; bila tidak, catat LEWAT beserta alasannya.
  begin
    insert into user_usage (user_id, identity_key, period, plan, credits_total, credits_used)
    values (v_test_user, 'account:' || v_test_user::text, v_period, 'free', 10, 1);
    v_user_row := true;
  exception
    when others then
      v_user_row := false;
      get diagnostics v_sqlstate = returned_sqlstate;
      v_hasil_uid := 'LEWAT (butuh baris auth.users nyata — FK user_usage.user_id → auth.users(id), '
                  || 'migrasi 008_user_id.sql; SQLSTATE ' || coalesce(v_sqlstate, '?') || ')';
  end;

  if v_user_row then
    begin
      v_u1 := refund_credit_by_user(v_test_user, v_period, 'verify031:uidem:v1', 'uji 031');
      v_u2 := refund_credit_by_user(v_test_user, v_period, 'verify031:uidem:v1', 'uji 031');
      v_hasil_uid := case when v_u1 = 0 and v_u2 = -1 then 'LULUS' else 'GAGAL' end
                  || ' (pertama=' || coalesce(v_u1::text, 'null')
                  || ', kedua='    || coalesce(v_u2::text, 'null') || ')';
    exception
      when others then
        get diagnostics v_sqlstate = returned_sqlstate;
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


