import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getTrendingNow, getAkanTrending } from "@/lib/trend-engine";
import { readBehaviorSignals } from "@/lib/persona";
import { buildPersonalizedSuggest, SuggestDeps } from "@/lib/suggest-engine";

const PROJECTS_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * GET /api/suggest — suggest topik yang dipersonalisasi per user.
 *
 * Alur: identifikasi user login (cookie) → gabungkan behavior (preferences/regen-lanjut)
 * + trend (trending now ID / akan trending US) → ide relevan.
 * - User tanpa profil / anonim → fallback ke suggest global.
 * - No breaking change: endpoint baru, `/api/ideas` & jalur lama tidak tersentuh.
 * - Preferensi (provider/platform/durasi) dikembalikan sebagai metadata, bukan rank.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 10);

  let userId: string | null = null;
  try {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    // Best-effort; dianggap anonim.
  }

  const service = createServiceRoleClient();

  const deps: SuggestDeps = {
    loadProfileNiche: async () => {
      if (!userId) return null;
      const { data } = await service
        .from("profiles")
        .select("niche_slug")
        .eq("user_id", userId)
        .maybeSingle();
      if (typeof data?.niche_slug === "string" && data.niche_slug) return data.niche_slug;
      return null;
    },
    loadProjectGenres: async () => {
      if (!userId) return [];
      const since = new Date(Date.now() - PROJECTS_WINDOW_MS).toISOString();
      const { data } = await service
        .from("projects")
        .select("genre_slug, created_at")
        .eq("user_id", userId)
        .gte("created_at", since)
        .limit(100);
      return (data ?? [] as Array<{ genre_slug?: unknown; created_at?: unknown }>).map(
        (r) => ({
          genre: typeof r.genre_slug === "string" ? r.genre_slug : "",
          created_at: typeof r.created_at === "string" ? r.created_at : "",
        })
      );
    },
    loadBehavior: async () => {
      return readBehaviorSignals(userId ?? undefined);
    },
    loadTrendingNow: (niche: string) => getTrendingNow(niche),
    loadAkanTrending: (niche: string) => getAkanTrending(niche),
  };

  const result = await buildPersonalizedSuggest(deps, limit);

  // Kurangi jejak respons: hanya kirim field yang dipakai UI.
  const ideas = result.ideas.map((i) => ({
    keyword: i.keyword,
    niche_slug: i.niche_slug,
    score: i.score,
    source: i.source,
    velocity: i.velocity ?? null,
    trend_direction: i.trend_direction ?? null,
    preferences: i.preferences ?? {},
  }));

  return NextResponse.json({
    success: true,
    personalized: result.personalized,
    signal: result.signal,
    source: result.source,
    niches: result.niches,
    count: ideas.length,
    ideas,
  });
}