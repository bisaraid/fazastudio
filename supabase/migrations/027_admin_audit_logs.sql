-- Faza Studio — Migration 027: Audit log aksi admin (tanpa data sensitif).
-- Mencatat aksi admin (set_plan, set_admin, trigger_trends) untuk akuntabilitas.
-- subject_email disimpan dalam bentuk ter-redaksi (a***@x.com) dari sisi lib.

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null,            -- 'set_plan' | 'set_admin' | 'trigger_trends'
  subject_user_id text,
  subject_email text,
  payload jsonb,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_class where relname = 'admin_audit_logs' and relrowsecurity
  ) then
    alter table admin_audit_logs enable row level security;
  end if;
end $$;
create index if not exists idx_admin_audit_created on admin_audit_logs (created_at desc);