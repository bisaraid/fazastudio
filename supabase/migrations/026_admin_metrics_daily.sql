-- Faza Studio — Migration 026: Snapshot harian metrik admin (untuk chart & delta%).
-- Backfill TIDAK dijalankan di SQL — dijalankan sekali via skrip (scripts/backfill-admin-metrics.ts).
-- Baris hasil backfill ditandai is_estimated=true (data yang sudah dihapus tidak terhitung).

create table if not exists admin_metrics_daily (
  date date primary key,
  total_users int not null default 0,
  total_projects int not null default 0,
  total_scripts int not null default 0,
  total_trends int not null default 0,
  paid_users int not null default 0,
  is_estimated boolean not null default false,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_class where relname = 'admin_metrics_daily' and relrowsecurity
  ) then
    alter table admin_metrics_daily enable row level security;
  end if;
end $$;
-- service role bypass otomatis; tidak ada policy publik → hanya diakses server-side.