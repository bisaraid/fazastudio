/**
 * Penyiap baris cache AI-fallback untuk /api/ideas.
 *
 * Dua masalah yang diperbaiki (bug audit Tahap 1):
 *  1. Bentrok unique index (keyword, niche_slug, tanggal): ide AI sering
 *     duplikat antar request & berbeda kapitalisasi dengan baris harvest /
 *     request sebelumnya. Solusi: normalisasi keyword, dedupe in-batch,
 *     dan buang yang sudah ada di DB untuk niche+tanggal yang sama.
 *  2. Pencampuran monitoring: baris tetap `source = 'ai_fallback'` sehingga
 *     kueri monitoring (byNiche/count) bisa mengecualikannya.
 */

import { normalizeKeyword } from "@/lib/trend-insight";

export interface AiFallbackRow {
  keyword: string;
  niche_slug: string;
  source: "ai_fallback";
  score: number;
  score_breakdown: Record<string, never>;
  fetched_at: string;
  first_seen_at: string;
}

/**
 * Bangun baris siap-insert dari ide AI:
 * - normalisasi keyword (lowercase/trim/spasi ganda),
 * - buang ide kosong & duplikat dalam batch,
 * - buang keyword yang sudah ada (existingKeywords, sudah ternormalisasi).
 */
export function buildAiFallbackRows(
  ideas: string[],
  niche: string,
  nowIso: string,
  existingKeywords: string[]
): AiFallbackRow[] {
  const existing = new Set(existingKeywords.map((k) => normalizeKeyword(k)).filter(Boolean));
  const seen = new Set<string>();
  const rows: AiFallbackRow[] = [];

  for (const raw of ideas) {
    const keyword = normalizeKeyword(String(raw ?? ""));
    if (!keyword || seen.has(keyword) || existing.has(keyword)) continue;
    seen.add(keyword);
    rows.push({
      keyword,
      niche_slug: niche,
      source: "ai_fallback",
      score: 0,
      score_breakdown: {} as Record<string, never>,
      fetched_at: nowIso,
      first_seen_at: nowIso,
    });
  }
  return rows;
}
