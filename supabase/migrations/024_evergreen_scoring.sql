-- Migration 024: Evergreen scoring + accumulate per (keyword, niche, date)
--
-- Tujuan:
--  1. Reset trend_ideas (skema baru; data lama tidak lagi relevan).
--  2. Hapus unique index lama yang include `source` (satu keyword per niche per HARI,
--     lintas source — agar format yang sama dari beberapa source di-accumulate).
--  3. Kolom accumulate & evergreen.
--  4. Unique index baru (keyword, niche_slug, date) TANPA source.
--  5. Fungsi `upsert_trend_row` — INSERT ... ON CONFLICT ... DO UPDATE yang
--     mengumpulkan appearances / source_count / sources_seen dan menghitung ulang
--     evergreen_score. (Supabase `.upsert()` tidak bisa menjalankan logika update
--     custom ini, jadi proses dilakukan lewat fungsi ini via RPC.)

-- 1) Reset data
truncate table trend_ideas;

-- 2) Drop unique index lama yang include source
drop index if exists idx_trend_ideas_unique_daily;

-- 3) Tambah kolom accumulate + evergreen
alter table trend_ideas
  add column if not exists appearances   int     not null default 1,
  add column if not exists source_count  int     not null default 1,
  add column if not exists sources_seen  text[]  not null default '{}',
  add column if not exists evergreen_score numeric  not null default 0;

-- 4) Unique index baru: satu keyword per niche per HARI, lintas source.
--    Ekspresi IMMUTABLE (UTC) agar aman di index; CAST(... AS date) demi
--    kompatibilitas runner/parser SQL.
drop index if exists idx_trend_ideas_unique_keyword_niche_date;
create unique index idx_trend_ideas_unique_keyword_niche_date
  on trend_ideas (keyword, niche_slug, CAST((fetched_at AT TIME ZONE 'UTC') AS date));

-- 5) Fungsi upsert-accumulate (dipakai cron route via RPC)
create or replace function upsert_trend_row(
  p_keyword           text,
  p_niche_slug        text,
  p_source            text,
  p_score             numeric,
  p_velocity          numeric,
  p_trend_direction   text,
  p_youtube_video_id  text,
  p_youtube_title     text,
  p_youtube_channel   text,
  p_youtube_views     bigint,
  p_youtube_likes     bigint,
  p_youtube_uploaded_at timestamptz,
  p_fetched_at        timestamptz
) returns void
language plpgsql
as $$
begin
  insert into trend_ideas (
    keyword, niche_slug, source, score, score_breakdown, velocity, trend_direction,
    youtube_video_id, youtube_title, youtube_channel, youtube_views, youtube_likes,
    youtube_uploaded_at, fetched_at, first_seen_at,
    appearances, source_count, sources_seen,
    evergreen_score
  ) values (
    p_keyword, p_niche_slug, p_source, p_score, '{}'::jsonb, p_velocity, p_trend_direction,
    p_youtube_video_id, p_youtube_title, p_youtube_channel, p_youtube_views, p_youtube_likes,
    p_youtube_uploaded_at, p_fetched_at, p_fetched_at,
    1, 1, array[p_source],
    ( p_score * least(1, 3) * 0.5 )
      + ( least(1.0 / 7.0, 1) * 30 )
      + ( least(coalesce(p_velocity, 0) * 10, 20) )
  )
  on conflict (keyword, niche_slug, CAST((fetched_at AT TIME ZONE 'UTC') AS date))
  do update set
    appearances = trend_ideas.appearances + 1,
    source_count = case
      when p_source = any(trend_ideas.sources_seen) then trend_ideas.source_count
      else trend_ideas.source_count + 1
    end,
    sources_seen = case
      when p_source = any(trend_ideas.sources_seen) then trend_ideas.sources_seen
      else array_append(trend_ideas.sources_seen, p_source)
    end,
    score = greatest(trend_ideas.score, p_score),
    velocity = p_velocity,
    trend_direction = p_trend_direction,
    youtube_video_id = coalesce(p_youtube_video_id, trend_ideas.youtube_video_id),
    youtube_title = coalesce(p_youtube_title, trend_ideas.youtube_title),
    youtube_channel = coalesce(p_youtube_channel, trend_ideas.youtube_channel),
    youtube_views = greatest(trend_ideas.youtube_views, coalesce(p_youtube_views, 0)),
    youtube_likes = greatest(trend_ideas.youtube_likes, coalesce(p_youtube_likes, 0)),
    youtube_uploaded_at = coalesce(p_youtube_uploaded_at, trend_ideas.youtube_uploaded_at),
    fetched_at = greatest(trend_ideas.fetched_at, p_fetched_at),
    evergreen_score = (
      greatest(trend_ideas.score, p_score)
        * least(
            case
              when p_source = any(trend_ideas.sources_seen) then trend_ideas.source_count
              else trend_ideas.source_count + 1
            end,
            3
          )
        * 0.5
    ) + (
      least((trend_ideas.appearances + 1) / 7.0, 1) * 30
    ) + (
      least(coalesce(p_velocity, trend_ideas.velocity, 0) * 10, 20)
    );
end;
$$;