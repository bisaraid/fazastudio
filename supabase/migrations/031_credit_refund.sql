-- Faza Studio Database Schema — Migration 031 (Fase 4A)
-- ============================================================
-- REFUND KREDIT IDEMPOTEN (kebalikan `decrement_credit` / `decrement_credit_by_user`)
--
-- MASALAH: `/api/generate-script` memotong 1 kredit SEBELUM memanggil LLM.
--   Jika generate gagal (exception/500), kredit pengguna hangus tanpa hasil.
--
-- ISI (IDEMPOTEN — aman dijalankan berulang):
--   1. Tabel ledger `credit_refunds` — satu baris per kejadian yang di-refund.
--   2. `refund_credit(identity_key, period, idempotency_key, reason)`    → jalur anon.
--   3. `refund_credit_by_user(user_id, period, idempotency_key, reason)` → jalur akun.
--
-- KONTRAK RPC:
--   - Mengembalikan `credits_used` yang baru bila refund terjadi.
--   - Mengembalikan **-1** bila kunci idempotensi SUDAH pernah dipakai
--     (pemanggil memperlakukannya sebagai sukses idempoten, bukan error).
--   - Melempar exception bila tidak ada baris/kuota 0 untuk di-refund
--     (transaksi rollback ⇒ kunci idempotensi TIDAK "terpakai sia-sia").
--
-- KOLOM: cocok dengan skema yang ada (003/014/018/028/030) —
--   user_usage(identity_key text, user_id uuid, period text, credits_used int,
--              credits_total int, updated_at timestamptz).
--
-- SECURITY: kedua fungsi ditulis eksplisit `security definer set search_path = public`
--   (bukan mengandalkan default) supaya perilakunya tidak bergantung pada
--   `search_path` pemanggil. Eksekusi DIBATASI ke `service_role`; RLS ledger
--   aktif tanpa policy ⇒ hanya service role (bypass RLS) yang bisa membacanya.
--
-- PRASYARAT: 003, 014, 018, 028 sudah diterapkan.
-- CARA JALAN: eksekusi SELURUH file dalam SATU kali jalan (sudah dibungkus
--   begin/commit). BELUM dijalankan oleh tim kode ini.
-- ROLLBACK: drop function refund_credit*; drop table credit_refunds;
-- ============================================================

begin;

-- ============================================================
-- 1. Ledger idempotensi refund
-- ============================================================
-- `idempotency_key` deterministik per kejadian, mis. `script:<projectId>:<requestId>`.
create table if not exists credit_refunds (
  idempotency_key text primary key,
  identity_key    text,
  user_id         uuid,
  -- period DEBET (YYYY-MM), bukan period saat refund dipanggil.
  period          text not null,
  reason          text,
  created_at      timestamptz not null default now()
);

comment on table credit_refunds is
  'Ledger refund kredit (Fase 4A). Satu baris per kejadian; kunci idempotensi deterministik. Diisi HANYA oleh function refund_credit*.';
comment on column credit_refunds.period is
  'Period DEBET yang dikembalikan (YYYY-MM) — bukan period saat refund dipanggil.';

create index if not exists idx_credit_refunds_created_at
  on credit_refunds (created_at desc);

-- ============================================================
-- 2. refund_credit — jalur ANON (identity_key, period)
-- ============================================================
create or replace function refund_credit(
  p_identity_key    text,
  p_period          text,
  p_idempotency_key text,
  p_reason          text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits_used integer;
begin
  -- (a) Klaim kunci idempotensi lebih dulu. ON CONFLICT DO NOTHING ⇒ pemanggil
  --     kedua (retry request / job dobel) langsung tahu refund sudah terjadi.
  insert into credit_refunds (idempotency_key, identity_key, period, reason)
  values (p_idempotency_key, p_identity_key, p_period, p_reason)
  on conflict (idempotency_key) do nothing;

  if not found then
    return -1;                       -- sudah pernah di-refund untuk kejadian ini
  end if;

  -- (b) Guard non-negatif: WHERE + greatest() sebagai dua lapis pengaman.
  update user_usage
     set credits_used = greatest(credits_used - 1, 0),
         updated_at   = now()
   where identity_key = p_identity_key
     and period       = p_period
     and credits_used > 0
  returning credits_used into v_credits_used;

  if v_credits_used is null then
    -- Tidak ada yang bisa dikembalikan (baris hilang / credits_used = 0):
    -- batalkan klaim kunci (rollback) supaya percobaan lain tidak "hangus".
    raise exception 'refund_credit: tidak ada kredit untuk di-refund (%)', p_idempotency_key
      using errcode = 'P0001';
  end if;

  return v_credits_used;
end;
$$;

-- ============================================================
-- 3. refund_credit_by_user — jalur AKUN (user_id, period)
-- ============================================================
create or replace function refund_credit_by_user(
  p_user_id         uuid,
  p_period          text,
  p_idempotency_key text,
  p_reason          text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits_used integer;
begin
  insert into credit_refunds (idempotency_key, user_id, period, reason)
  values (p_idempotency_key, p_user_id, p_period, p_reason)
  on conflict (idempotency_key) do nothing;

  if not found then
    return -1;
  end if;

  update user_usage
     set credits_used = greatest(credits_used - 1, 0),
         updated_at   = now()
   where user_id      = p_user_id
     and period       = p_period
     and credits_used > 0
  returning credits_used into v_credits_used;

  if v_credits_used is null then
    raise exception 'refund_credit_by_user: tidak ada kredit untuk di-refund (%)', p_idempotency_key
      using errcode = 'P0001';
  end if;

  return v_credits_used;
end;
$$;

-- ============================================================
-- 4. Hak akses — HANYA service_role (route Next server-side)
-- ============================================================
revoke all on function refund_credit(text, text, text, text)         from public, anon, authenticated;
revoke all on function refund_credit_by_user(uuid, text, text, text) from public, anon, authenticated;
grant execute on function refund_credit(text, text, text, text)         to service_role;
grant execute on function refund_credit_by_user(uuid, text, text, text) to service_role;

-- Ledger tertutup: RLS aktif tanpa policy (service role bypass RLS).
alter table credit_refunds enable row level security;

commit;

-- ============================================================
-- VERIFIKASI SETELAH DEPLOY (manual, read-only)
-- ============================================================
-- (a) fungsi + security definer + search_path tetap:
--   select p.proname, p.prosecdef, p.proconfig
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('refund_credit','refund_credit_by_user');
-- (b) hak eksekusi (harus hanya service_role):
--   select routine_name, grantee, privilege_type
--     from information_schema.routine_privileges
--    where routine_name in ('refund_credit','refund_credit_by_user');
-- (c) uji idempotensi (ganti nilai sesuai baris uji):
--   select refund_credit('anon:test','2026-09','script:uji:1','uji');  -- → angka
--   select refund_credit('anon:test','2026-09','script:uji:1','uji');  -- → -1
-- (d) bersihkan data uji:
--   delete from credit_refunds where idempotency_key = 'script:uji:1';
-- ============================================================

