/**
 * Cron Job: /api/cron/trends
 *
 * Harvest flow (multi-source):
 * - Fetch top 50 trending ID (YouTube, geen category filter).
 * - Fetch Google Trends (daily, ID) + RSS (Detik/Kompas) parallel.
 * - Gabung alle judul -> dedupe -> topic-extractor (Groq).
 * - Insert naar trend_ideas met source per asal: "youtube" | "google_trends" | "rss".
 *
 * Proteksi: header Authorization: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  fetchYouTubeTrending,
  SOURCE_YOUTUBE,
  YouTubeVideo,
} from "@/lib/trend-youtube";
import { extractTopicsFromTitles } from "@/lib/topic-extractor";
import { fetchGoogleTrends } from "@/lib/harvest-google-trends";
import { fetchRssTitles } from "@/lib/harvest-rss";

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
export async function GET(request: NextRequest) {
  // ===== Proteksi CRON_SECRET =====
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  // ===== 1. Fetch top 50 ID (geen category filter) =====
  const idRes = await fetchYouTubeTrending(TOP_VIDEOS, "ID");

  // ===== 1b. Google Trends + RSS (parallel, best-effort) =====
  const [gtRes, rssRes] = await Promise.allSettled([
    fetchGoogleTrends(),
    fetchRssTitles(),
  ]);
  const gtTitles = gtRes.status === "fulfilled" ? gtRes.value : [];
  const rssTitles = rssRes.status === "fulfilled" ? rssRes.value : [];

  // ===== 2. Siapkan batch per source =====
  const ytTitles: string[] = [];
  const ytVideos: YouTubeVideo[] = [];
  for (const v of idRes.data ?? []) {
    const t = (v.title || "").trim();
    if (!t) continue;
    ytTitles.push(t);
    ytVideos.push(v);
  }
  console.log(
    `[cron-trends] fetched youtube=${ytTitles.length} gt=${gtTitles.length} rss=${rssTitles.length}`
  );

  // ===== 3. Ekstrak topik per source (sequential) =====
  // Urutan: RSS dulu (paling banyak item & paling valuable) → jeda 15s → YouTube.
  // Kalau YouTube jalan duluan, ia sering kena 429 / boros rate-limit Groq.
  // Google Trends tetap terakhir, dengan jeda serupa.
  function sleep(ms: number): Promise<void> {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  const rssExtracted = await extractTopicsFromTitles(rssTitles);
  await sleep(15000);
  const ytExtracted = await extractTopicsFromTitles(ytTitles);
  await sleep(15000);
  const gtExtracted = await extractTopicsFromTitles(gtTitles);
  console.log(
    `[cron-trends] extracted youtube=${ytExtracted.length} gt=${gtExtracted.length} rss=${rssExtracted.length}`
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

  // ===== 4b. Group per niche + prepare DB rows =====
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
    byNiche[item.niche] = byNiche[item.niche] ? [...byNiche[item.niche], row] : [row];
  }

  // ===== 5. Insert per niche (error handling + logging per niche) =====
  const results: { niche: string; count: number; source: string }[] = [];
  let total = 0;
  for (const niche of Object.keys(byNiche)) {
    const nicheRows = byNiche[niche];
    let count = 0;
    let err: string | null = null;
    try {
      for (const row of nicheRows) {
        const { error } = await supabase.from("trend_ideas").insert([row]);
        if (error) {
          if (error.code !== "23505") {
            err = error.message;
            break;
          }
        } else {
          count++;
        }
      }
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    console.log(
      `[cron-trends] niche=${niche} rows=${count}` + (err ? ` error=${err}` : "")
    );
    results.push({ niche, count, source: err ? "error" : "mixed" });
    total += count;
  }

  console.log(
    `[cron-trends] done rows=${rows.length} inserted=${total} skipped=${skipped}`
  );

  return NextResponse.json({
    success: true,
    message: `Cron trends selesai: ${total} data dari ${Object.keys(byNiche).length} niche`,
    total,
    skipped,
    results,
  });
}
