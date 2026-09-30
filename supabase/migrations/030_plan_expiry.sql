-- Faza Studio — Migration 030 (deliverable A / "030A-min")
-- ============================================================
-- MASA BERLAKU PLAN (EXPIRY) + CARRY-OVER ANTAR PERIODE
--
-- MASALAH: setiap baris `user_usage` periode bulan baru selalu dibuat dengan
--   plan 'free' (003/014/018/028), sedangkan plan berbayar hasil aktivasi
--   manual admin hanya tersimpan di baris periode berjalan TANPA masa berlaku.
--   Akibatnya setiap tanggal 1 user berbayar otomatis turun ke Gratis
--   (kuota 10, kunci suara premium, watermark, dsb).
--
-- ISI (IDEMPOTEN — aman dijalankan berulang):
--   1. Kolom plan_expires_at / plan_activated_at / plan_source (additif, nullable).
--   2. Helper plan_is_active / effective_plan / effective_credits_total
--      — satu sumber kebenaran "plan masih berlaku atau tidak".
--   3. Trigger trg_user_usage_plan_expiry — jaring pengaman aktivasi:
--      plan berbayar tanpa expiry otomatis dapat 30 hari; perpanjangan
--      menambah dari SISA (bukan menimpa).
--   4. ensure_usage_row()         — carry-over plan + normalisasi expiry (anon).
--   5. ensure_usage_row_by_user() — idem, jalur akun (user_id).
--
-- SCOPE: kolom expiry HANYA mengatur masa berlaku PLAN/AKSES, BUKAN kredit.
--   Kuota bulanan (credits_total/credits_used reset per periode) tidak diubah.
--   Model kredit akan diganti "credit wallet" di tahap terpisah ⇒ di sini TIDAK
--   ada perubahan decrement/claim/sweep/revoke.
--
-- KOMPATIBEL MUNDUR: nama, argumen, dan kolom hasil ensure_usage_row* tidak
--   berubah ⇒ kode web & worker lama tetap jalan tanpa deploy ulang.
-- PRASYARAT: 003, 014, 018, 028 sudah diterapkan.
-- CARA JALAN: eksekusi SELURUH file ini dalam SATU kali jalan (sudah dibungkus
--   begin/commit). Jangan per blok. Lanjutkan dengan
--   supabase/manual/030a_verify.sql.
-- ROLLBACK: supabase/manual/030a_rollback.sql
-- ============================================================

begin;

-- ============================================================
-- 1. Kolom masa berlaku plan (additif; baris lama TIDAK disentuh)
-- ============================================================
alter table user_usage
  add column if not exists plan_expires_at   timestamptz,
  add column if not exists plan_activated_at timestamptz,
  add column if not exists plan_source       text;

comment on column user_usage.plan_expires_at is
  'Akhir masa berlaku PLAN/AKSES berbayar. NULL + plan<>free = legacy/permanen; NULL + plan=free = tanpa masa berlaku. Tidak mengatur kredit.';
comment on column user_usage.plan_activated_at is
  'Waktu aktivasi/perpanjangan plan terakhir.';
comment on column user_usage.plan_source is
  'Asal aktivasi plan: admin | admin-backfill | webhook | carryover | default-30d.';

-- ============================================================
-- 2. Helper — satu sumber kebenaran "plan aktif atau tidak"
-- ============================================================
create or replace function plan_is_active(p_plan text, p_expires timestamptz)
returns boolean
language sql
stable
as $$
  select coalesce(p_plan, 'free') <> 'free'
     and (p_expires is null or p_expires > now());
$$;

create or replace function effective_plan(p_plan text, p_expires timestamptz)
returns text
language sql
stable
as $$
  select case when plan_is_active(p_plan, p_expires) then p_plan else 'free' end;
$$;

create or replace function effective_credits_total(
  p_plan text,
  p_expires timestamptz,
  p_total integer
)
returns integer
language sql
stable
as $$
  select case
           when plan_is_active(p_plan, p_expires) then coalesce(p_total, 10)
           else 10
         end;
$$;

-- ============================================================
-- 3. Trigger jaring pengaman: default & perpanjangan masa berlaku
-- ============================================================
-- Menyala HANYA saat kolom plan / plan_expires_at disebut sebagai target
-- (BEFORE INSERT OR UPDATE OF ...) DAN nilai plan benar-benar berubah.
-- ⇒ Operasi kredit (credits_used) tidak pernah menyentuh deadline.
-- ⇒ Klik "aktifkan plan" dua kali dengan plan yang sama TIDAK menggandakan
--   masa berlaku (new.plan IS DISTINCT FROM old.plan = false).
-- Baris carry-over (plan_source='carryover', expiry NULL = legacy/permanen)
-- DIBIARKAN apa adanya — tidak diberi now()+30 hari.
create or replace function user_usage_plan_expiry_default()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.plan is not null
       and new.plan <> 'free'
       and new.plan_expires_at is null
       and coalesce(new.plan_source, '') <> 'carryover' then
      new.plan_expires_at   := now() + interval '30 days';
      new.plan_activated_at := coalesce(new.plan_activated_at, now());
      new.plan_source       := coalesce(new.plan_source, 'default-30d');
    end if;
  elsif new.plan is distinct from old.plan then
    if new.plan is not null and new.plan <> 'free' then
      if new.plan_expires_at is null then
        new.plan_expires_at := case
          when old.plan_expires_at is not null and old.plan_expires_at > now()
            then old.plan_expires_at + interval '30 days'   -- perpanjangan: tambah sisa
          else now() + interval '30 days'
        end;
        new.plan_source := coalesce(new.plan_source, 'default-30d');
      end if;
      new.plan_activated_at := coalesce(new.plan_activated_at, now());
    else
      -- Turun ke free → bersihkan seluruh metadata masa berlaku.
      new.plan_expires_at   := null;
      new.plan_activated_at := null;
      new.plan_source       := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_user_usage_plan_expiry on user_usage;
create trigger trg_user_usage_plan_expiry
  before insert or update of plan, plan_expires_at on user_usage
  for each row execute function user_usage_plan_expiry_default();

-- ============================================================
-- 4. ensure_usage_row — carry-over plan antar periode (jalur ANON)
-- ============================================================
-- Perubahan vs 014:
--   * Baris periode baru TIDAK lagi selalu 'free': plan berbayar yang masih
--     berlaku (plan_expires_at > now(), atau NULL = legacy/permanen) disalin
--     apa adanya ke periode baru (plan + credits_total + plan_expires_at),
--     sedangkan credits_used tetap 0 (kuota bulanan baru).
--   * Baris periode berjalan yang masa berlakunya sudah lewat dinormalisasi
--     ke free/10 (sekali saja) SEBELUM dibaca → laporan admin yang membaca
--     tabel langsung ikut melihat keadaan jujur.
--   * Signature & kolom hasil TIDAK berubah ⇒ klien lama tetap kompatibel.
--
-- #variable_conflict use_column: RETURNS TABLE memakai nama yang sama dengan
-- kolom (plan, credits_total, credits_used). Semua referensi kolom di body ini
-- sudah dikualifikasi alias `u.`; direktif ini (tepat setelah pembuka body)
-- membuat PL/pgSQL memilih kolom saat ada nama ambigu, bukan melempar error
-- "column reference is ambiguous" di kemudian hari.
create or replace function ensure_usage_row(
  p_identity_key text,
  p_period text
) returns table (
  plan text,
  credits_total integer,
  credits_used integer
) language plpgsql as $$
#variable_conflict use_column
declare
  v_prev_plan    text;
  v_prev_expires timestamptz;
  v_prev_total   integer;
  v_carry        boolean := false;
begin
  -- Sumber carry-over: periode terakhir milik identity ini — HANYA baris anon
  -- (user_id IS NULL) supaya baris akun hasil klaim tidak "menetes" ke device.
  select u.plan, u.plan_expires_at, u.credits_total
    into v_prev_plan, v_prev_expires, v_prev_total
  from user_usage u
  where u.identity_key = p_identity_key
    and u.user_id is null
    and u.period < p_period
  order by u.period desc
  limit 1;

  v_carry := plan_is_active(v_prev_plan, v_prev_expires);

  insert into user_usage (identity_key, period, plan, credits_total, credits_used,
                          plan_expires_at, plan_source)
  values (
    p_identity_key,
    p_period,
    case when v_carry then v_prev_plan else 'free' end,
    case when v_carry then coalesce(v_prev_total, 10) else 10 end,
    0,
    case when v_carry then v_prev_expires else null end,
    case when v_carry then 'carryover'    else null end
  )
  on conflict (identity_key, period) do nothing;

  -- Lazy normalisasi: masa berlaku sudah lewat → turun ke free (sekali saja).
  update user_usage u
     set plan              = 'free',
         credits_total     = 10,
         credits_used      = 0,
         plan_expires_at   = null,
         plan_activated_at = null,
         plan_source       = null,
         updated_at        = now()
   where u.identity_key = p_identity_key
     and u.user_id is null
     and u.period = p_period
     and u.plan is not null
     and u.plan <> 'free'
     and u.plan_expires_at is not null
     and u.plan_expires_at <= now();

  -- Yang dikembalikan adalah nilai EFEKTIF (sudah memperhitungkan expiry).
  return query
    select effective_plan(u.plan, u.plan_expires_at)::text,
           effective_credits_total(u.plan, u.plan_expires_at, u.credits_total)::integer,
           coalesce(u.credits_used, 0)::integer
    from user_usage u
    where u.identity_key = p_identity_key
      and u.period = p_period
    limit 1;
end;
$$;

-- ============================================================
-- 5. ensure_usage_row_by_user — carry-over plan antar periode (jalur AKUN)
-- ============================================================
-- Versi 028 diganti agar aturannya IDENTIK dengan jalur anon: carry-over plan
-- berbayar yang masih berlaku + normalisasi expiry + nilai hasil efektif.
-- Kolom hasil & signature tetap sama; `identity_key` tetap diisi
-- 'account:<user_id>' (konsisten dengan 028) sehingga indeks unik
-- (identity_key, period) tetap eksklusif per akun.
create or replace function ensure_usage_row_by_user(
  p_user_id uuid,
  p_period text
) returns table (
  plan text,
  credits_total integer,
  credits_used integer
) language plpgsql as $$
#variable_conflict use_column
declare
  v_prev_plan    text;
  v_prev_expires timestamptz;
  v_prev_total   integer;
  v_carry        boolean := false;
begin
  select u.plan, u.plan_expires_at, u.credits_total
    into v_prev_plan, v_prev_expires, v_prev_total
  from user_usage u
  where u.user_id = p_user_id
    and u.period < p_period
  order by u.period desc
  limit 1;

  v_carry := plan_is_active(v_prev_plan, v_prev_expires);

  insert into user_usage (user_id, identity_key, period, plan, credits_total,
                          credits_used, plan_expires_at, plan_source)
  values (
    p_user_id,
    'account:' || p_user_id::text,
    p_period,
    case when v_carry then v_prev_plan else 'free' end,
    case when v_carry then coalesce(v_prev_total, 10) else 10 end,
    0,
    case when v_carry then v_prev_expires else null end,
    case when v_carry then 'carryover'    else null end
  )
  on conflict (user_id, period) do nothing;

  -- Lazy normalisasi masa berlaku yang sudah lewat (sekali saja).
  update user_usage u
     set plan              = 'free',
         credits_total     = 10,
         credits_used      = 0,
         plan_expires_at   = null,
         plan_activated_at = null,
         plan_source       = null,
         updated_at        = now()
   where u.user_id = p_user_id
     and u.period = p_period
     and u.plan is not null
     and u.plan <> 'free'
     and u.plan_expires_at is not null
     and u.plan_expires_at <= now();

  return query
    select effective_plan(u.plan, u.plan_expires_at)::text,
           effective_credits_total(u.plan, u.plan_expires_at, u.credits_total)::integer,
           coalesce(u.credits_used, 0)::integer
    from user_usage u
    where u.user_id = p_user_id
      and u.period = p_period
    limit 1;
end;
$$;

-- ============================================================
-- 6. Segarkan cache skema PostgREST (fungsi baru: plan_is_active dkk.)
-- ============================================================
notify pgrst, 'reload schema';

commit;
