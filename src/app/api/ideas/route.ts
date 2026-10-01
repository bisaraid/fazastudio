/**
 * API Endpoint: /api/ideas
 *
 * Mengembalikan daftar trend/topik relevan untuk niche user.
 * Alur: cache DB → YouTube → AI fallback
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { fetchTrendingByNiche } from "@/lib/trend-youtube";
import { scoreTrends, getTopTrends } from "@/lib/trend-scoring";
import { buildAiFallbackRows } from "@/lib/ideas-fallback";
import { checkRateLimit, buildBurstKey, getClientIp } from "@/lib/rate-limit";
import { getServerIdentity } from "@/lib/identity";
import { RATE_LIMIT_LIMITS, MINUTE_WINDOW_MS } from "@/lib/rate-limit-config";
import { aiCompletion } from "@/lib/ai/completion";
import { parseJsonArrayLoose } from "@/lib/ai/json";

const CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 jam

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const niche = searchParams.get("niche") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 10);
  // Sinyal: "now" (default, trending sekarang) | "upcoming" (akan trending dari youtube_us).

  const supabase = createServiceRoleClient();

  // ===== Mode GLOBAL (tanpa niche): top 1 per niche, maks 6, urut score tertinggi =====
  // Tidak wajib niche — dipakai homepage untuk menampilkan trending lintas kategori.
  if (!niche) {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const GLOBAL_MAX = 6;

    // Ambil hasil yang sudah ORDER BY score desc, lalu ambil 1 (paling tinggi) per niche.
    // Ini setara "distinct on (niche_slug) ... order by niche_slug, score desc",
    // tanpa index baru & tanpa fitur distinctOn (belum didukung supabase-js versi ini).
    const collect = async (requireFresh: boolean) => {
      let query = supabase
        .from("trend_ideas")
        .select("keyword, niche_slug, score, velocity, trend_direction")
        .order("score", { ascending: false });
      if (requireFresh) query = query.gte("fetched_at", cutoff);

      const { data } = await query;
      const seen = new Set<string>();
      const out: Array<{ keyword: string; niche_slug: string; score: number; velocity: number | null; trend_direction: string | null }> = [];
      for (const r of (data ?? []) as Array<{
        keyword?: unknown;
        niche_slug?: unknown;
        score?: unknown;
        velocity?: unknown;
        trend_direction?: unknown;
      }>) {
        const niche = typeof r.niche_slug === "string" ? r.niche_slug : "";
        if (!niche || seen.has(niche)) continue;
        seen.add(niche);
        out.push({
          keyword: typeof r.keyword === "string" ? r.keyword : "",
          niche_slug: niche,
          score: Number(r.score ?? 0),
          velocity: r.velocity === null || r.velocity === undefined ? null : Number(r.velocity),
          trend_direction: typeof r.trend_direction === "string" ? r.trend_direction : null,
        });
        if (out.length >= GLOBAL_MAX) break;
      }
      return out;
    };

    // Fallback: jika hasil < 3, ambil tanpa filter fetched_at (data lama > kosong).
    let ideas = await collect(true);
    if (ideas.length < 3) {
      const stale = await collect(false);
      if (stale.length > ideas.length) ideas = stale;
    }

    return NextResponse.json({
      success: true,
      signal: "now",
      source: "global",
      count: ideas.length,
      ideas,
    });
  }

  // 1. Cek cache (< 48 jam)
  const cacheCutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
  const { data: cached } = await supabase
    .from("trend_ideas")
    .select("*")
    .eq("niche_slug", niche)
    .gte("fetched_at", cacheCutoff)
    .order("score", { ascending: false })
    .limit(limit);

  if (cached && cached.length >= 3) {
    return NextResponse.json({
      success: true,
      signal: "now",
      source: "youtube",
      ideas: cached.map((row) => ({
        keyword: row.keyword,
        score: row.score,
        breakdown: row.score_breakdown,
        youtubeVideoId: row.youtube_video_id,
        youtubeTitle: row.youtube_title,
        youtubeChannel: row.youtube_channel,
        youtubeViews: row.youtube_views,
        velocity: row.velocity === null || row.velocity === undefined ? null : Number(row.velocity),
        trend_direction: typeof row.trend_direction === "string" ? row.trend_direction : null,
      })),
    });
  }

  // 2. Cache miss → fetch YouTube
  const ytResult = await fetchTrendingByNiche(niche, 10);

  if (ytResult.success && ytResult.data.length > 0) {
    const scored = scoreTrends(ytResult.data, niche);
    const topTrends = getTopTrends(scored, limit);

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

    return NextResponse.json({
      success: true,
      signal: "now",
      source: "youtube",
      ideas: topTrends.map((t) => ({
        keyword: t.keyword,
        score: t.score,
        breakdown: t.breakdown,
        youtubeVideoId: t.youtubeVideoId,
        youtubeTitle: t.youtubeTitle,
        youtubeChannel: t.youtubeChannel,
        youtubeViews: t.youtubeViews,
        velocity: null,
        trend_direction: null,
      })),
    });
  }


  // ===== RATE-LIMIT rond AI-fallback (Groq — betaalde service) =====
  // YouTube/cache-route kost niets; alleen de AI-call wordt gebounded.
  {
    const identity = getServerIdentity(request);
    const ip = getClientIp(request);
    const rl = await checkRateLimit(
      buildBurstKey(identity.identityKey, ip, "ideas-ai"),
      RATE_LIMIT_LIMITS.ideasAIperMinute,
      MINUTE_WINDOW_MS
    );
    if (!rl.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Terlalu banyak request ide. Coba lagi dalam enkele detik.",
          code: "IDEAS_AI_RATE_LIMIT",
        },
        {
          status: 429,
          headers: {
            "Retry-After": rl.resetInSeconds.toString(),
            "X-RateLimit-Remaining": rl.remaining.toString(),
          },
        }
      );
    }
  }

  // 3. YouTube gagal → Fallback AI
  const aiIdeas = await generateAIFallback(niche, limit);
  if (aiIdeas.length > 0) {
    // Hindari bentrok unique index (keyword, niche, tanggal): buang ide yang
    // sudah ada hari ini untuk niche ini (baris harvest maupun AI request lama).
    const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
    const { data: existingRows } = await supabase
      .from("trend_ideas")
      .select("keyword")
      .eq("niche_slug", niche)
      .gte("fetched_at", dayStart);
    const rowsToInsert = buildAiFallbackRows(
      aiIdeas,
      niche,
      new Date().toISOString(),
      (existingRows ?? []).map((r) => r.keyword)
    );

    if (rowsToInsert.length > 0) {
      const { error: insertErr } = await supabase.from("trend_ideas").insert(rowsToInsert);
      if (insertErr) {
        // 23505 = race dengan request lain; bukan fatal (cache gagal = AI dipanggil lagi).
        console.warn(
          `[ideas] insert ai_fallback gagal: code=${insertErr.code} message=${insertErr.message}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      signal: "now",
      source: "ai_fallback",
      ideas: aiIdeas.map((idea) => ({ keyword: idea, score: 0, breakdown: {} })),
    });
  }

  return NextResponse.json({ success: true, signal: "now", source: "none", ideas: [] });
}

/**
 * Generate fallback ideas menggunakan AI (Groq).
 * HANYA dipanggil kalau YouTube API gagal & cache kosong — agar token hemat.
 */
async function generateAIFallback(niche: string, limit: number): Promise<string[]> {
  const nicheLabels: Record<string, string> = {
    skincare: "skincare & kecantikan",
    fashion: "fashion & outfit",
    gadget: "gadget & teknologi",
    makanan: "makanan & kuliner",
    suplemen: "suplemen & kesehatan",
    perabot: "perabot & dekorasi rumah",
    mistis: "cerita mistis & horor",
    motivasi: "motivasi & inspirasi kehidupan",
    edukasi: "edukasi & tips",
    keuangan: "keuangan & investasi",
    curhat: "curhat & relationship",
    sejarah: "sejarah & fakta menarik",
  };

  const prompt = `Kamu membantu content creator. Berikan ${limit} ide topik konten video yang sedang populer di Indonesia untuk niche "${nicheLabels[niche] ?? niche}".
Format: JSON object dengan kunci "ideas" berisi array of strings (hanya judul/topik singkat, maks 8 kata tiap item), tanpa teks lain.
Contoh: {"ideas": ["Review serum vitamin C lokal", "5 outfit hijab casual kekinian"]}`;

  try {
    // Jalur AI bersama: Groq (GROQ_MODEL_LIGHT = openai/gpt-oss-20b) → OpenRouter.
    // `json: true` → JSON rusak otomatis memicu pindah ke cadangan.
    const res = await aiCompletion({
      tier: "light",
      json: true,
      feature: "ideas",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 900, // gpt-oss = reasoning model → beri ruang untuk token berpikir
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const parsed = parseJsonArrayLoose(res.content);
    if (Array.isArray(parsed)) {
      return parsed.filter((s) => typeof s === "string").slice(0, limit);
    }
    return [];
  } catch (e) {
    console.warn(
      `[ideas] AI fallback gagal (${e instanceof Error ? e.message : String(e)}) → kembalikan ide kosong`
    );
    return [];
  }
}

