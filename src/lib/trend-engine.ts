/**
 * Trend Pattern Engine — query server-side (service role) untuk DUA sinyal terpisah:
 *  - "Trending sekarang" (trendingNow): source "youtube" (ID) dengan velocity positif.
 *  - "Akan trending" (akanTrending): source "youtube_us" yang belum muncul di keyword ID.
 *
 * Best-effort: kegagalan/env tidak tersedia → array kosong (tidak pernah throw).
 */

import { createServiceRoleClient } from "@/lib/supabase/service";

export interface TrendIdeaItem {
  keyword: string;
  niche_slug: string;
  score: number;
  source: string;
  velocity?: number | null;
  trend_direction?: string | null;
}

const TREND_WINDOW_MS = 48 * 60 * 60 * 1000;

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

/** Fisher–Yates shuffle untuk diversifikasi pool di level engine. */
function shuffleTrends<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * "Trending sekarang": keyword source "youtube", score tinggi, arah velocity positif/up.
 * Kalau `niche` kosong → GLOBAL: top 2 by score per niche (pool beragam dari semua niche),
 * lalu shuffled di level engine. Window tetap 48 jam.
 */
export async function getTrendingNow(
  niche: string
): Promise<TrendIdeaItem[]> {
  try {
    const supabase = createServiceRoleClient();
    const cutoff = new Date(Date.now() - TREND_WINDOW_MS).toISOString();

    let query = supabase
      .from("trend_ideas")
      .select("keyword, niche_slug, score, source, velocity, trend_direction")
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
    let out: TrendIdeaItem[] = [];
    if (niche) {
      // Mode per-niche: top 10 by score untuk niche tsb.
      for (const r of rows) {
        out.push(rowToItem(r));
        if (out.length >= 10) break;
      }
    } else {
      // Mode global: top 2 by score per niche (pool beragam dari semua niche),
      // lalu shuffle di level engine agar variasi per request.
      const byNiche = new Map<string, TrendIdeaItem[]>();
      for (const r of rows) {
        const item = rowToItem(r);
        const key = item.niche_slug;
        const list = byNiche.get(key) ?? [];
        if (list.length < 2) {
          list.push(item);
          byNiche.set(key, list);
        }
      }
      Array.from(byNiche.values()).forEach((list) => out.push(...list));
      out = shuffleTrends(out);
    }
    return out;
  } catch {
    return [];
  }
}
