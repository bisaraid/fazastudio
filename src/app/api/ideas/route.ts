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

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const niche = searchParams.get("niche") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 10);

  if (!niche) {
    return NextResponse.json(
      { success: false, error: "Parameter 'niche' wajib diisi" },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();

  // 1. Cek cache (< 6 jam)
  const cacheCutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
  const { data: cached } = await supabase
    .from("trend_ideas")
    .select("*")
    .eq("niche_slug", niche)
    .eq("source", "youtube")
    .gte("fetched_at", cacheCutoff)
    .order("score", { ascending: false })
    .limit(limit);

  if (cached && cached.length >= 3) {
    return NextResponse.json({
      success: true,
      source: "youtube",
      ideas: cached.map((row) => ({
        keyword: row.keyword,
        score: row.score,
        breakdown: row.score_breakdown,
        youtubeVideoId: row.youtube_video_id,
        youtubeTitle: row.youtube_title,
        youtubeChannel: row.youtube_channel,
        youtubeViews: row.youtube_views,
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
      source: "youtube",
      ideas: topTrends.map((t) => ({
        keyword: t.keyword,
        score: t.score,
        breakdown: t.breakdown,
        youtubeVideoId: t.youtubeVideoId,
        youtubeTitle: t.youtubeTitle,
        youtubeChannel: t.youtubeChannel,
        youtubeViews: t.youtubeViews,
      })),
    });
  }


  // 3. YouTube gagal → Fallback AI
  const aiIdeas = await generateAIFallback(niche, limit);
  if (aiIdeas.length > 0) {
    const rowsToInsert = aiIdeas.map((idea) => ({
      keyword: idea,
      niche_slug: niche,
      source: "ai_fallback",
      score: 0,
      score_breakdown: {},
      fetched_at: new Date().toISOString(),
      first_seen_at: new Date().toISOString(),
    }));
    await supabase.from("trend_ideas").insert(rowsToInsert);

    return NextResponse.json({
      success: true,
      source: "ai_fallback",
      ideas: aiIdeas.map((idea) => ({ keyword: idea, score: 0, breakdown: {} })),
    });
  }

  return NextResponse.json({ success: true, source: "none", ideas: [] });
}

/**
 * Generate fallback ideas menggunakan AI (Groq).
 * HANYA dipanggil kalau YouTube API gagal & cache kosong — agar token hemat.
 */
async function generateAIFallback(niche: string, limit: number): Promise<string[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return [];

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
Format: JSON array of strings (hanya judul/topik singkat, maks 8 kata tiap item), tanpa teks lain.
Contoh: ["Review serum vitamin C lokal", "5 outfit hijab casual kekinian"]`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!res.ok) return [];

    const json = await res.json();
    const content = (json.choices?.[0]?.message?.content ?? "[]").trim();

    // Bersihkan wrapping code fence jika AI membungkus dengan ```json ... ```
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((s) => typeof s === "string").slice(0, limit);
    }
    return [];
  } catch {
    return [];
  }
}

