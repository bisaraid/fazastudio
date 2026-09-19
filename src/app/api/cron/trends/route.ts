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
  // ===== 2. Gabung judul + dedupe (source per asal data) =====
  const seen = new Set<string>();
  const titles: string[] = [];
  const sources: string[] = [];
  const videos: Array<YouTubeVideo | null> = [];

  function pushTitle(title: string, source: string, video: YouTubeVideo | null) {
    const t = (title || "").trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    titles.push(t);
    sources.push(source);
    videos.push(video);
  }
  for (const v of idRes.data ?? []) pushTitle(v.title, SOURCE_YOUTUBE, v);
  for (const t of gtTitles) pushTitle(t, SOURCE_GOOGLE_TRENDS, null);
  for (const t of rssTitles) pushTitle(t, SOURCE_RSS, null);

  let keptYoutube = 0, keptGt = 0, keptRss = 0;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (s === SOURCE_YOUTUBE) keptYoutube++;
    else if (s === SOURCE_GOOGLE_TRENDS) keptGt++;
    else keptRss++;
  }
  console.log(`[cron-trends] BEFORE dedupe youtube=${idRes.data?.length ?? 0} gt=${gtTitles.length} rss=${rssTitles.length}`);
  console.log(`[cron-trends] AFTER  dedupe youtube=${keptYoutube} gt=${keptGt} rss=${keptRss} total=${titles.length}`);


  // ===== 3. Topic-extractor via Groq =====
  const extracted = await extractTopicsFromTitles(titles);
console.log(`[cron-trends] extracted=${extracted.length} groq_key=${!!process.env.GROQ_API_KEY2}`);
  // ===== 4. Group per niche + prepare rows =====
  const byNiche: Record<string, Record<string, unknown>[]> = {};
  let skipped = 0;
  for (const item of extracted) {
    if (!item.topic || !item.niche) {
      skipped++;
      continue;
    }
    const v = videos[item.index];
    const row: Record<string, unknown> = {
      keyword: item.topic,
      niche_slug: item.niche,
      source: sources[item.index],
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
    `[cron-trends] done extracted=${extracted.length} inserted=${total} skipped=${skipped}`
  );

  return NextResponse.json({
    success: true,
    message: `Cron trends selesai: ${total} data dari ${Object.keys(byNiche).length} niche`,
    total,
    skipped,
    results,
  });
}
