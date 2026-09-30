-- Faza Studio — Migration 029: RPC agregat per-niche untuk monitoring /admin/trending
-- ============================================================
-- MASALAH: byNiche di /api/admin/trends memindai SELURUH kolom niche_slug
-- (full-scan, O(N) transfer ke aplikasi, salah hitung bila melebihi limit
-- baris default PostgREST 1000).
-- SOLUSI: agregasi GROUP BY di-database. Baris `ai_fallback` (cache /api/ideas,
-- sumber non-harvest) DIKECUALIKAN supaya monitoring murni data harvest.
--
-- Idempoten: aman dijalankan berulang (create or replace + grant/revoke).
-- ============================================================

create or replace function admin_trend_niche_counts()
returns table (niche_slug text, total bigint)
language sql
stable
as $$
  select t.niche_slug,
         count(*)::bigint as total
  from trend_ideas t
  where t.source is distinct from 'ai_fallback'
  group by t.niche_slug
  order by total desc, t.niche_slug asc;
$$;

-- Hanya service role (route server-side). Eksekusi dari anon/authenticated
-- diblokir — fungsi ini tidak pernah dipanggil dari klien.
revoke execute on function admin_trend_niche_counts() from public;
revoke execute on function admin_trend_niche_counts() from anon;
revoke execute on function admin_trend_niche_counts() from authenticated;
grant execute on function admin_trend_niche_counts() to service_role;

-- ============================================================
-- QUERY VERIFIKASI (aman dijalankan setelah script di atas)
-- ============================================================

-- (a) Fungsi terdaftar dan mengembalikan hasil (harus memuat niche yang ada)
select * from admin_trend_niche_counts() limit 5;

-- (b) Konsistensi: total fungsi = jumlah baris non-ai_fallback
select (select coalesce(sum(total), 0) from admin_trend_niche_counts()) as total_fungsi,
       (select count(*) from trend_ideas where source is distinct from 'ai_fallback') as total_kueri;

-- (c) Fungsi TIDAK mengeluarkan niche baris ai_fallback-saja
select distinct t.niche_slug
  from trend_ideas t
 where t.source = 'ai_fallback'
   and t.niche_slug not in (
     select t2.niche_slug from trend_ideas t2 where t2.source is distinct from 'ai_fallback'
   );

-- (d) Perbandingan per niche (fungsi vs kueri manual) — harus identik
select coalesce(f.niche_slug, m.niche_slug) as niche,
       coalesce(f.total, 0) as dari_fungsi,
       coalesce(m.total, 0) as manual
  from admin_trend_niche_counts() f
  full outer join (
    select niche_slug, count(*)::bigint as total
      from trend_ideas
     where source is distinct from 'ai_fallback'
     group by niche_slug
  ) m on m.niche_slug = f.niche_slug
 order by niche;
