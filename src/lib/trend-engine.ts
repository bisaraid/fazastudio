/**
 * Trend Pattern Engine — query server-side (service role) untuk DUA sinyal terpisah:
 *  - "Trending sekarang" (trendingNow): source "youtube" (ID) dengan velocity positif.
 *  - "Akan trending" (akanTrending): source "youtube_us" yang belum muncul di keyword ID.
 *
 * Best-effort: kegagalan/env tidak tersedia → array kosong (tidak pernah throw).
 */

import { createServiceRoleClient } from "@/lib/supabase/service";
import { SOURCE_YOUTUBE, SOURCE_YOUTUBE_US } from "@/lib/trend-youtube";
import { isKeywordAlreadyPresent } from "@/lib/trend-scoring";

export interface TrendIdeaItem {
  keyword: string;
  niche_slug: string;
  score: number;
  source: string;
  velocity?: number | null;
  trend_direction?: string | null;
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

interface TrendRow {
  keyword?: unknown;
  niche_slug?: unknown;
  score?: unknown;
  source?: unknown;
  velocity?: unknown;
  trend_direction?: unknown;
}

function rowToItem(r: TrendRow): TrendIdeaItem {
  return {
    keyword: asString(r.keyword),
    niche_slug: asString(r.niche_slug),
    score: asNumber(r.score) ?? 0,
    source: asString(r.source),
    velocity: asNumber(r.velocity),
    trend_direction: r.trend_direction == null ? null : asString(r.trend_direction),
  };
}

/**
 * "Trending sekarang": keyword source "youtube", score tinggi, arah velocity positif/up.
 * Kalau `niche` kosong → GLOBAL (across niche, distinct per niche, urut score).
 */
export async function getTrendingNow(
  niche: string
): Promise<TrendIdeaItem[]> {
  try {
    const supabase = createServiceRoleClient();
    const cutoff = new Date(Date.now() - TWELVE_HOURS_MS).toISOString();

    let query = supabase
      .from("trend_ideas")
      .select("keyword, niche_slug, score, source, velocity, trend_direction")
      .eq("source", SOURCE_YOUTUBE)
      .gte("fetched_at", cutoff);

    if (niche) {
      query = query.eq("niche_slug", niche);
    }
    // Up atau velocity positif (velocity null belum punya baseline → tetap bisa muncul,
    // tapi "sedang naik" diutamakan dengan urut direction up dulu, lalu score).
    query = query
      .order("trend_direction", { ascending: false })
      .order("score", { ascending: false });

    const { data, error } = await query.limit(50);
    if (error || !data) return [];

    const rows = data as TrendRow[];
    // Distinct per niche untuk mode GLOBAL.
    const seen = new Set<string>();
    const out: TrendIdeaItem[] = [];
    for (const r of rows) {
      const item = rowToItem(r);
      const key = niche ? item.niche_slug : `${item.niche_slug}|${item.keyword.toLowerCase()}`;
      if (niche) {
        out.push(item);
        if (out.length >= 10) break;
      } else {
        if (seen.has(item.niche_slug)) continue;
        seen.add(item.niche_slug);
        out.push(item);
        if (out.length >= 6) break;
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * "Akan trending": keyword source "youtube_us" yang belum muncul di keyword source
 * "youtube" milik niche yang sama. Kalau `niche` kosong → GLOBAL (distinct per niche).
 */
export async function getAkanTrending(
  niche: string
): Promise<TrendIdeaItem[]> {
  try {
    const supabase = createServiceRoleClient();
    const cutoff = new Date(Date.now() - TWELVE_HOURS_MS).toISOString();

    const buildBase = () =>
      supabase
        .from("trend_ideas")
        .select("keyword, niche_slug, score, source, velocity, trend_direction")
        .eq("source", SOURCE_YOUTUBE_US)
        .gte("fetched_at", cutoff);

    let query = buildBase();
    if (niche) {
      query = query.eq("niche_slug", niche);
    }
    const { data: usRows, error } = await query
      .order("score", { ascending: false })
      .limit(60);

    if (error || !usRows) return [];

    // Baseline keyword ID per niche (source "youtube", fresh).
    let baseQuery =
      supabase
        .from("trend_ideas")
        .select("keyword, niche_slug")
        .eq("source", SOURCE_YOUTUBE)
        .gte("fetched_at", cutoff);
    if (niche) {
      baseQuery = baseQuery.eq("niche_slug", niche);
    }
    const { data: idRows } = await baseQuery.limit(200);

    const baselineByNiche = new Map<string, string[]>();
    for (const r of (idRows ?? []) as { keyword?: unknown; niche_slug?: unknown }[]) {
      const n = asString(r.niche_slug);
      const k = asString(r.keyword);
      if (!n || !k) continue;
      const list = baselineByNiche.get(n) ?? [];
      list.push(k);
      baselineByNiche.set(n, list);
    }

    const seen = new Set<string>();
    const out: TrendIdeaItem[] = [];
    for (const r of (usRows as TrendRow[])) {
      const item = rowToItem(r);
      const baseline = baselineByNiche.get(item.niche_slug) ?? [];
      // Lewati keyword yang sudah muncul di data ID → bukan lagi "akan trending".
      if (isKeywordAlreadyPresent(baseline, item.keyword)) continue;
      if (niche) {
        out.push(item);
        if (out.length >= 10) break;
      } else {
        if (seen.has(item.niche_slug)) continue;
        seen.add(item.niche_slug);
        out.push(item);
        if (out.length >= 6) break;
      }
    }
    return out;
  } catch {
    return [];
  }
}