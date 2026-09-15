/**
 * Cron Job: /api/cron/trends
 *
 * Dipanggil otomatis setiap 6 jam oleh Vercel Cron Jobs.
 * Mengambil YouTube trending untuk semua niche yang ada di sistem:
 *  - ID harvest (region ID) → score → simpan source "youtube".
 *  - US harvest (region US, keyword diterjemahkan ke Bahasa Indonesia)
 *    → score → simpan source "youtube_us" sebagai early-signal.
 *  - Keduanya di-refresh velocity-nya (banding score hari ini vs hari sebelumnya).
 *
 * Proteksi: header Authorization: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  fetchTrendingByNiche,
  NICHE_TO_YT_CATEGORY,
  SOURCE_YOUTUBE,
  SOURCE_YOUTUBE_US,
} from "@/lib/trend-youtube";
import { scoreTrends, getTopTrends, computeVelocity } from "@/lib/trend-scoring";
import { translateMany } from "@/lib/translate";

const ALL_NICHES = [
  "skincare", "fashion", "gadget", "makanan", "suplemen", "perabot",
  "mistis", "motivasi", "edukasi", "keuangan", "curhat", "sejarah",
];

const US_HARVEST_MAX = 10;

async function findPreviousScore(
  supabase: ReturnType<typeof createServiceRoleClient>,
  keyword: string,
  niche: string,
  source: string,
  todayStart: string
): Promise<number | null> {
  const { data } = await supabase
    .from("trend_ideas")
    .select("score")
    .eq("keyword", keyword)
    .eq("niche_slug", niche)
    .eq("source", source)
    .lt("fetched_at", todayStart)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const score = data?.score;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

export async function GET(request: NextRequest) {
  // ===== Proteksi CRON_SECRET =====
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const results: { niche: string; count: number; usCount: number; source: string }[] = [];
  const todayStart = new Date().toISOString().split("T")[0]; // hari ini (UTC) sebagai boundary

  for (const niche of ALL_NICHES) {
    const hasCategory = NICHE_TO_YT_CATEGORY[niche] !== null && NICHE_TO_YT_CATEGORY[niche] !== undefined;
    if (!hasCategory) {
      results.push({ niche, count: 0, usCount: 0, source: "skipped" });
      continue;
    }

    // ===== 1. ID harvest (source "youtube") =====
    const ytResult = await fetchTrendingByNiche(niche, 10, "ID");
    let count = 0;
    if (ytResult.success && ytResult.data.length > 0) {
      const scored = scoreTrends(ytResult.data, niche);
      const topTrends = getTopTrends(scored, 5);
      const rowsToInsert = await buildRows(topTrends, niche, SOURCE_YOUTUBE, supabase, todayStart);
      if (rowsToInsert.length > 0) {
        await supabase.from("trend_ideas").insert(rowsToInsert);
        count = rowsToInsert.length;
      }
    }

    // ===== 2. US harvest (source "youtube_us") → translate → simpan =====
    let usCount = 0;
    const usResult = await fetchTrendingByNiche(niche, US_HARVEST_MAX, "US");
    if (usResult.success && usResult.data.length > 0) {
      const usScored = scoreTrends(usResult.data, niche);
      const usTop = getTopTrends(usScored, Math.min(usScored.length, US_HARVEST_MAX));
      const usKeywords = usTop.map((t) => t.keyword);
      const translated = await translateMany(usKeywords);
      const translatedScored = usTop.map((t, i) => ({
        ...t,
        keyword: translated[i] || t.keyword,
        youtubeTitle: translated[i] || t.youtubeTitle,
      }));
      const rowsToInsert = await buildRows(translatedScored, niche, SOURCE_YOUTUBE_US, supabase, todayStart);
      if (rowsToInsert.length > 0) {
        await supabase.from("trend_ideas").insert(rowsToInsert);
        usCount = rowsToInsert.length;
      }
    }

    results.push({
      niche,
      count,
      usCount,
      source: count + usCount > 0 ? (usCount > 0 ? "youtube+youtube_us" : "youtube") : "miss",
    });

    // Rate limit: jeda 200ms antar request YouTube.
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({
    success: true,
    message: `Cron trends selesai: ${results.reduce((a, r) => a + r.count + r.usCount, 0)} data dari ${results.length} niche`,
    results,
  });
}

/** Bangun baris insert + hitung velocity (banding score hari sebelumnya). */
async function buildRows(
  scored: ReturnType<typeof scoreTrends>,
  niche: string,
  source: string,
  supabase: ReturnType<typeof createServiceRoleClient>,
  todayStart: string
) {
  const rows: Record<string, unknown>[] = [];
  for (const t of scored) {
    const prevScore = await findPreviousScore(supabase, t.keyword, niche, source, todayStart);
    const vel = computeVelocity(t.score, prevScore);
    rows.push({
      keyword: t.keyword,
      niche_slug: niche,
      source,
      score: t.score,
      score_breakdown: t.breakdown,
      youtube_video_id: t.youtubeVideoId ?? null,
      youtube_title: t.youtubeTitle ?? t.keyword,
      youtube_channel: t.youtubeChannel ?? null,
      youtube_views: t.youtubeViews ?? 0,
      youtube_likes: t.youtubeLikes ?? 0,
      youtube_uploaded_at: t.youtubeUploadedAt ?? null,
      fetched_at: new Date().toISOString(),
      first_seen_at: new Date().toISOString(),
      prev_score: prevScore,
      velocity: vel ? vel.velocity : null,
      trend_direction: vel ? vel.direction : null,
    });
  }
  return rows;
}
