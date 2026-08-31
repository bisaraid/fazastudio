/**
 * Cron Job: /api/cron/trends
 *
 * Dipanggil otomatis setiap 6 jam oleh Vercel Cron Jobs.
 * Mengambil YouTube trending untuk semua niche yang ada di sistem,
 * men-scoring, dan menyimpan ke tabel trend_ideas.
 *
 * Proteksi: header Authorization: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { fetchTrendingByNiche, NICHE_TO_YT_CATEGORY } from "@/lib/trend-youtube";
import { scoreTrends, getTopTrends } from "@/lib/trend-scoring";

const ALL_NICHES = [
  "skincare", "fashion", "gadget", "makanan", "suplemen", "perabot",
  "mistis", "motivasi", "edukasi", "keuangan", "curhat", "sejarah",
];

export async function GET(request: NextRequest) {
  // ===== Proteksi CRON_SECRET =====
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const results: { niche: string; count: number; source: string }[] = [];

  for (const niche of ALL_NICHES) {
    const hasCategory = NICHE_TO_YT_CATEGORY[niche] !== null && NICHE_TO_YT_CATEGORY[niche] !== undefined;
    if (!hasCategory) {
      results.push({ niche, count: 0, source: "skipped" });
      continue;
    }

    // Fetch YouTube trending
    const ytResult = await fetchTrendingByNiche(niche, 10);

    if (ytResult.success && ytResult.data.length > 0) {
      const scored = scoreTrends(ytResult.data, niche);
      const topTrends = getTopTrends(scored, 5);

      // Simpan ke DB
      const rowsToInsert = topTrends.map((t) => ({
        keyword: t.keyword,
        niche_slug: niche,
        source: "youtube",
        score: t.score,
        score_breakdown: t.breakdown,
        youtube_video_id: t.youtubeVideoId,
        youtube_title: t.youtubeTitle,
        youtube_channel: t.youtubeChannel,
        youtube_views: t.youtubeViews,
        youtube_likes: t.youtubeLikes,
        youtube_uploaded_at: t.youtubeUploadedAt,
        fetched_at: new Date().toISOString(),
        first_seen_at: new Date().toISOString(),
      }));

      await supabase.from("trend_ideas").insert(rowsToInsert);
      results.push({ niche, count: rowsToInsert.length, source: "youtube" });
    } else {
      // Fallback: tandai sebagai miss, akan diisi AI saat user request
      results.push({ niche, count: 0, source: "miss" });
    }

    // Rate limit: jeda 200ms antar request YouTube
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({
    success: true,
    message: `Cron trends selesai: ${results.reduce((a, r) => a + r.count, 0)} data dari ${results.length} niche`,
    results,
  });
}
