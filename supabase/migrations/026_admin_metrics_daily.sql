-- Faza Studio — Migration 026: Admin metrics snapdaily (history untuk chart & delta%)
-- No backfill di SQL — backfill jalankan sekali viea skrip (scripts/backfill-admin-metrics.ts).
-- is_estimated=true tanja baris hasil backfill (data yang sudah dihapus tidak terhitung).

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
-- service role bypass auto; tidak ada policy public → hanya server-side/core route