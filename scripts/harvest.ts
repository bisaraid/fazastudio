/**
 * Standalone Trend Harvester — Faza Studio
 *
 * Dijalankan langsung di GitHub Actions (bukan via endpoint Vercel) agar tidak
 * terkena batas timeout Vercel Hobby (±10 detik).
 *
 * Logika disalin dari src/app/api/cron/trends/route.ts:
 * - Fetch YouTube top-50 ID + Google Trends + RSS secara PARALLEL (Promise.allSettled).
 * - Ekstraksi topik + niche via Groq secara PARALLEL (Promise.all, best-effort).
 * - Simpan ke Supabase via RPC upsert_trend_row.
 *
 * Memakai relative import (../src/lib/...) karena berjalan di luar konteks Next.js
 * (alias "@/..." dari tsconfig tidak diresolusi oleh tsx tanpa baseUrl).
 *
 * Env yang dibutuhkan:
 *   YOUTUBE_API_KEY            → fetchYouTubeTrending
 *   GROQ_API_KEY2              → topic-extractor (ekstraksi Groq)
 *   NEXT_PUBLIC_SUPABASE_URL   → supabase service client
 *   SUPABASE_SERVICE_ROLE_KEY  → supabase service client
 */

import { fetchYouTubeTrending, SOURCE_YOUTUBE, YouTubeVideo } from "../src/lib/trend-youtube";
import { extractTopicsFromTitles } from "../src/lib/topic-extractor";
import { fetchGoogleTrends } from "../src/lib/harvest-google-trends";
import { fetchRssTitles } from "../src/lib/harvest-rss";
import { createServiceRoleClient } from "../src/lib/supabase/service";

const TOP_VIDEOS = 50;
const SOURCE_GOOGLE_TRENDS = "google_trends";
const SOURCE_RSS = "rss";

/** Baris hasil extract yang siap di-group per niche. */
interface ExtractRow {
  topic: string;
  niche: string;
  source: string;
  sourceTitle: string;
  video: YouTubeVideo | null;
}

async function main(): Promise<void> {
  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

// ===== 1 & 1b. Fetch YouTube + Google Trends + RSS — PARALLEL (best-effort) =====
  const [idRes, gtRes] = await Promise.allSettled([
    fetchYouTubeTrending(TOP_VIDEOS, "ID"),
    fetchGoogleTrends(),
  ]);
  const ytTop = idRes.status === "fulfilled" ? idRes.value : { success: false, data: [] };
  const gtTitles = gtRes.status === "fulfilled" ? gtRes.value : [];
  const rssTitles: string[] = []; // RSS di-skip sementara

  // ===== 2. Siapkan batch per source =====
  const ytTitles: string[] = [];
  const ytVideos: YouTubeVideo[] = [];
  for (const v of ytTop.data ?? []) {
    const t = (v.title || "").trim();
    if (!t) continue;
    ytTitles.push(t);
    ytVideos.push(v);
  }
  console.log(
    `[harvest] fetched youtube=${ytTitles.length} gt=${gtTitles.length} rss=${rssTitles.length}`
  );
// ===== 3. Ekstraksi topik per source — SEQUENTIAL dengan jeda 2s antar batch =====
  // Serial (hanya 1 request Groq per waktu) menghindari 429 burst rate-limit.
  const rssExtracted: Awaited<ReturnType<typeof extractTopicsFromTitles>> = [];
  await new Promise((r) => setTimeout(r, 2000));
  const ytExtracted = await extractTopicsFromTitles(ytTitles);
  await new Promise((r) => setTimeout(r, 2000));
  const gtExtracted = await extractTopicsFromTitles(gtTitles);
  console.log(
    `[harvest] extracted youtube=${ytExtracted.length} gt=${gtExtracted.length} rss=${rssExtracted.length}`
  );

  // ===== 4. Gabung hasil extract per source =====
  const rows: ExtractRow[] = [];
  for (const it of ytExtracted) {
    rows.push({
      topic: it.topic,
      niche: it.niche,
      source: SOURCE_YOUTUBE,
      sourceTitle: it.sourceTitle,
      video: ytVideos[it.index] ?? null,
    });
  }
  for (const it of gtExtracted) {
    rows.push({
      topic: it.topic,
      niche: it.niche,
      source: SOURCE_GOOGLE_TRENDS,
      sourceTitle: it.sourceTitle,
      video: null,
    });
  }
  for (const it of rssExtracted) {
    rows.push({
      topic: it.topic,
      niche: it.niche,
      source: SOURCE_RSS,
      sourceTitle: it.sourceTitle,
      video: null,
    });
  }

  // ===== 4b. Group per niche + siapkan DB rows =====
  const byNiche: Record<string, Record<string, unknown>[]> = {};
  let skipped = 0;
  for (const item of rows) {
    if (!item.topic || !item.niche) {
      skipped++;
      continue;
    }
    const v = item.video;
    const row: Record<string, unknown> = {
      keyword: item.topic,
      niche_slug: item.niche,
      source: item.source,
      score: 0,
      score_breakdown: {},
      youtube_video_id: v?.videoId ?? null,
      youtube_title: v?.title ?? item.sourceTitle,
      youtube_channel: v?.channelTitle ?? null,
      youtube_views: v?.viewCount ?? 0,
      youtube_likes: v?.likeCount ?? 0,
      youtube_uploaded_at: v?.publishedAt || null,
      fetched_at: nowIso,
      first_seen_at: nowIso,
    };
    byNiche[item.niche] = byNiche[item.niche] ?? [];
    byNiche[item.niche].push(row);
  }

  // ===== 5. Insert per niche (error handling + logging per niche) =====
  const results: { niche: string; count: number }[] = [];
  let total = 0;
  let fatalError: string | null = null;
  for (const niche of Object.keys(byNiche)) {
    const nicheRows = byNiche[niche];
    let count = 0;
    let err: string | null = null;
    try {
      for (const row of nicheRows) {
        // Upsert-accumulate: keyword per niche per hari (lintas source) di-merge;
        // appearances/source_count/sources_seen/evergreen diperbarui di DB.
        const { error } = await supabase.rpc("upsert_trend_row", {
          p_keyword: row.keyword as string,
          p_niche_slug: row.niche_slug as string,
          p_source: row.source as string,
          p_score: typeof row.score === "number" ? row.score : 0,
          p_velocity: null,
          p_trend_direction: null,
          p_youtube_video_id: (row.youtube_video_id as string | null) ?? null,
          p_youtube_title: (row.youtube_title as string | null) ?? null,
          p_youtube_channel: (row.youtube_channel as string | null) ?? null,
          p_youtube_views: typeof row.youtube_views === "number" ? row.youtube_views : 0,
          p_youtube_likes: typeof row.youtube_likes === "number" ? row.youtube_likes : 0,
          p_youtube_uploaded_at: (row.youtube_uploaded_at as string | null) ?? null,
          p_fetched_at: row.fetched_at as string,
        });
        if (error) {
          err = error.message;
          break;
        }
        count++;
      }
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      fatalError = err;
    }
    console.log(`[harvest] niche=${niche} rows=${count}` + (err ? ` error=${err}` : ""));
    results.push({ niche, count });
    total += count;
  }

  if (fatalError) {
    console.error(`[harvest] FAILED: ${fatalError}`);
    process.exit(1);
  }

  console.log(`[harvest] done rows=${rows.length} inserted=${total} skipped=${skipped}`);
  void results;
  process.exit(0);
}

main();