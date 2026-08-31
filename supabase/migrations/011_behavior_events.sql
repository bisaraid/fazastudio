-- ViraLoop Database Schema — Migration 011 (ACS)
-- Tabel behavior_events: mencatat sinyal perilaku user (mis. tombol "Ulangi").
-- Dipakai sistem untuk belajar preferensi user di masa depan.

create table if not exists behavior_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  -- 'regen_script' | 'regen_audio' | dst
  event_type text not null,
  created_at timestamptz default now()
);

create index if not exists idx_behavior_events_user
  on behavior_events (user_id, created_at desc);

create index if not exists idx_behavior_events_type
  on behavior_events (event_type);

-- ========================
-- RLS
-- ========================
alter table behavior_events enable row level security;

-- Hanya user pemilik yang bisa menulis (insert). Read ditutup (via service role aja).
drop policy if exists "Insert own behavior" on behavior_events;
create policy "Insert own behavior"
  on behavior_events
  for insert
  with check (auth.uid() = user_id);

-- Service role tetap bisa insert (bypass RLS) via API.