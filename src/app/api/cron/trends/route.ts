/**
 * Cron Job: /api/cron/trends
 *
 * Harvest flow nieuw (Sesi A):
 *  - Fetch top 50 trending ID + top 50 trending US (geen category filter).
 *  - Dedupe per judul.
 *  - Ekstrak topik + klasifikasi niche via Groq (topic-extractor).
 *  - Group per niche → simpan ke trend_ideas met source="youtube" en
 *    topik bersih (niet judul mentah) di kolom `keyword`.
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

const TOP_VIDEOS = 50;

export async function GET(request: NextRequest) {
  // ===== Proteksi CRON_SECRET =====
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  // ===== 1. Fetch top 50 ID + top 50 US (zonder category filter) =====
  const idRes = await fetchYouTubeTrending(TOP_VIDEOS, "ID");
  const usRes = await fetchYouTubeTrending(TOP_VIDEOS, "US");

  // ===== 2. Dedupe per judul =====
  const seen = new Set<string>();
  const videos: YouTubeVideo[] = [];
  for (const v of [...(idRes.data ?? []), ...(usRes.data ?? [])]) {
    const title = (v.title || "").trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    videos.push(v);
  }
console.log(`[cron-trends] fetch id=${idRes.data?.length ?? 0} us=${usRes.data?.length ?? 0} videos=${videos.length}`);

  console.log(
    `[cron-trends] fetched id=${idRes.data?.length ?? 0} us=${usRes.data?.length ?? 0} dedupe=${videos.length}`
  );

  // ===== 3. Topic-extractor via Groq =====
  const extracted = await extractTopicsFromTitles(videos.map((v) => v.title));
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
      source: SOURCE_YOUTUBE,
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
      // Insert per baris agar duplikat (unique_violation 23505) bisa di-skip aman
      // sehingga satu baris duplikat tidak menggagalkan seluruh batch. Duplikat tidak dihitung.
      for (const row of nicheRows) {
        const { error } = await supabase.from("trend_ideas").insert([row]);
        if (error) {
          if (error.code !== "23505") {
            err = error.message;
            break;
          }
          // 23505 = unique_violation → skip aman (tidak dihitung, bukan error)
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
    results.push({ niche, count, source: err ? "error" : "youtube" });
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