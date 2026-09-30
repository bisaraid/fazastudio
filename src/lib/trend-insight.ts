/**
 * Trend Insight — fungsi murni (tanpa I/O) untuk skor & velocity trend.
 *
 * Sumber angka: `trend-insight-config.ts` (SEMUA bobot & ambang di sana).
 * Dipakai oleh: runTrendHarvest() (src/lib/trend-harvest.ts) saat harvest.
 *
 * Kontrak:
 * - normalizeKeyword → lowercase, trim, spasi ganda → 1 spasi (deret harian
 *   di unique index (keyword, niche, tanggal) nyambung antar hari).
 * - computeTrendScore → { score 0..100, breakdown } — komponen terlihat,
 *   disimpan ke kolom `score_breakdown` (jsonb) agar bisa dijelaskan.
 * - planBatchScores → SATU baseline (baris 7 hari terakhir) → skor +
 *   prev_score + velocity + trend_direction per (keyword, niche) untuk
 *   seluruh batch harvest (bukan per topik).
 */

import { computeVelocity } from "@/lib/trend-scoring";
import {
  FREQUENCY_FULL_APPEARANCES,
  MULTI_SOURCE_FULL_COUNT,
  PRESENCE_WINDOW_DAYS,
  RECENCY_BUCKETS,
  SCORE_WEIGHTS,
  VIEWS_MOMENTUM_FULL_GROWTH,
} from "@/lib/trend-insight-config";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Kata kunci seragam: lowercase, trim, spasi ganda → 1 spasi. "" bila kosong. */
export function normalizeKeyword(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Poin recency menurut umur kemunculan pertama (bucket config, skala 0-10). */
function recencyPoints(ageDays: number): number {
  const safeAge = Number.isFinite(ageDays) ? Math.max(0, ageDays) : Infinity;
  for (const bucket of RECENCY_BUCKETS) {
    if (safeAge <= bucket.maxAgeDays) return bucket.points;
  }
  return RECENCY_BUCKETS[RECENCY_BUCKETS.length - 1].points;
}

/** Input komponen skor — semua angka mentah, dihitung dari baseline. */
export interface TrendScoreInput {
  /** Jumlah hari unik dalam window yang terisi topik ini (termasuk hari ini). */
  presentDays: number;
  /** Opsional: override window (default PRESENCE_WINDOW_DAYS). */
  windowDays?: number;
  /** Total views hari ini (greatest dari baris hari ini + batch baru). */
  viewsToday: number;
  /** Views baris kemarin; null = tidak ada baris kemarin (tanpa baseline). */
  viewsPrev: number | null;
  /** Jumlah sumber berbeda hari ini (union sources_seen + batch). */
  sourceCount: number;
  /** Kemunculan hari ini (berapa harvest membawa topik ini). */
  appearances: number;
  /** Umur kemunculan pertama yang teramati (hari; 0 = baru hari ini). */
  ageDays: number;
}

/** Breakdown yang disimpan ke score_breakdown (jsonb) — alasan skor. */
export interface TrendScoreBreakdown {
  presence: number;
  views_momentum: number;
  multi_source: number;
  frequency: number;
  recency: number;
  inputs: {
    present_days: number;
    window_days: number;
    views_today: number;
    views_prev: number | null;
    source_count: number;
    appearances: number;
    age_days: number;
  };
}

export interface TrendScoreResult {
  score: number;
  breakdown: TrendScoreBreakdown;
}

/**
 * Hitung skor 0-100 + breakdown per komponen (semua bobot dari config).
 * Momentum BUTUH baris kemarin (viewsPrev !== null); tanpa baseline → 0.
 */
export function computeTrendScore(input: TrendScoreInput): TrendScoreResult {
  const windowDays = input.windowDays ?? PRESENCE_WINDOW_DAYS;

  const presence = round1(clamp01(input.presentDays / windowDays) * SCORE_WEIGHTS.presence);

  let viewsMomentum = 0;
  if (input.viewsPrev !== null) {
    const growth =
      Math.log10(Math.max(0, input.viewsToday) + 1) -
      Math.log10(Math.max(0, input.viewsPrev) + 1);
    viewsMomentum = round1(
      clamp01(growth / VIEWS_MOMENTUM_FULL_GROWTH) * SCORE_WEIGHTS.views_momentum
    );
  }

  const multiSource = round1(
    clamp01(input.sourceCount / MULTI_SOURCE_FULL_COUNT) * SCORE_WEIGHTS.multi_source
  );
  const frequency = round1(
    clamp01(input.appearances / FREQUENCY_FULL_APPEARANCES) * SCORE_WEIGHTS.frequency
  );
  const recency = round1((recencyPoints(input.ageDays) / 10) * SCORE_WEIGHTS.recency);

  const score = Math.min(
    100,
    Math.max(0, round1(presence + viewsMomentum + multiSource + frequency + recency))
  );

  return {
    score,
    breakdown: {
      presence,
      views_momentum: viewsMomentum,
      multi_source: multiSource,
      frequency,
      recency,
      inputs: {
        present_days: input.presentDays,
        window_days: windowDays,
        views_today: input.viewsToday,
        views_prev: input.viewsPrev,
        source_count: input.sourceCount,
        appearances: input.appearances,
        age_days: input.ageDays,
      },
    },
  };
}

// ============================================================
// Perencanaan skor SELURUH batch dari satu baseline.
// ============================================================

/** Baris batch harvest yang SIAP di-upsert (keyword sudah ternormalisasi). */
export interface HarvestBatchRow {
  keyword: string;
  niche_slug: string;
  source: string;
  youtube_views: number;
}

/**
 * Baris baseline dari DB (7 hari terakhir). Field sesuai select di
 * runTrendHarvest; `sources_seen` dipakai menghitung sumber hari ini.
 */
export interface BaselineRow {
  keyword: string;
  niche_slug: string;
  fetched_at: string;
  score: number;
  youtube_views: number;
  appearances: number;
  source_count: number;
  source?: string | null;
  sources_seen?: string[] | null;
  first_seen_at?: string | null;
}

/** Rencana skor untuk SATU (keyword, niche) — siap dikirim ke RPC + UPDATE. */
export interface PlannedScore {
  keyword: string;
  niche_slug: string;
  score: number;
  breakdown: TrendScoreBreakdown;
  /** Score baris kemarin (apa adanya; 0 = baris legacy yang belum pernah diskor). */
  prev_score: number | null;
  /** null = tanpa baseline layak (belum ada baris kemarin / baseline legacy 0). */
  velocity: number | null;
  trend_direction: "up" | "stable" | "down" | null;
}

/** Key grouping: keyword ternormalisasi + niche. */
export function scoreKey(keyword: string, niche: string): string {
  return `${normalizeKeyword(keyword)}|${niche}`;
}

/** Tanggal UTC (YYYY-MM-DD) dari ISO — sama dengan unique index harvest. */
function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

function dayOffsetIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Rencana skor untuk SEMUA key dalam batch, dari SATU baseline.
 *
 * - presence: hari unik di window (termasuk hari ini, ditambah batch).
 * - views hari ini (greatest) vs kemarin → momentum (tanpa kemarin → 0).
 * - appearances = baris hari ini (baseline) + jumlah baris batch;
 *   sourceCount = union sources_seen baris hari ini + sumber batch.
 * - velocity: computeVelocity(score, prevScore) HANYA bila prevScore > 0
 *   (baris legacy tersimpan score 0 karena dulu tidak pernah diskor —
 *   bukan baseline yang bermakna). prev_score tetap disimpan apa adanya.
 */
export function planBatchScores(
  batch: HarvestBatchRow[],
  baseline: BaselineRow[],
  now: Date = new Date()
): Map<string, PlannedScore> {
  const today = utcDay(now.toISOString());
  const yesterday = dayOffsetIso(now, 1);
  const windowStart = dayOffsetIso(now, PRESENCE_WINDOW_DAYS - 1);

  const baselineByKey = new Map<string, BaselineRow[]>();
  for (const row of baseline) {
    const key = scoreKey(row.keyword, row.niche_slug);
    const list = baselineByKey.get(key);
    if (list) list.push(row);
    else baselineByKey.set(key, [row]);
  }

  const batchByKey = new Map<string, HarvestBatchRow[]>();
  for (const row of batch) {
    const key = scoreKey(row.keyword, row.niche_slug);
    const list = batchByKey.get(key);
    if (list) list.push(row);
    else batchByKey.set(key, [row]);
  }

  const planned = new Map<string, PlannedScore>();

  for (const [key, batchRows] of batchByKey) {
    const baseRows = baselineByKey.get(key) ?? [];
    const todayRows = baseRows.filter((r) => utcDay(r.fetched_at) === today);
    const prevRows = baseRows.filter((r) => utcDay(r.fetched_at) === yesterday);

    // Presence: hari unik ≥ windowStart, plus hari ini (batch menambah baris).
    const days = new Set<string>();
    for (const r of baseRows) {
      const d = utcDay(r.fetched_at);
      if (d >= windowStart && d <= today) days.add(d);
    }
    days.add(today);

    const viewsToday = Math.max(
      0,
      ...todayRows.map((r) => Number(r.youtube_views) || 0),
      ...batchRows.map((r) => r.youtube_views || 0)
    );
    const viewsPrev =
      prevRows.length > 0
        ? Math.max(...prevRows.map((r) => Number(r.youtube_views) || 0))
        : null;

    // Appearances: total upsert hari ini (baris baseline hari ini + batch).
    const appearances =
      todayRows.reduce((sum, r) => sum + (Number(r.appearances) || 0), 0) + batchRows.length;

    // Sumber hari ini: union sources_seen (fallback: kolom source) + batch.
    const sources = new Set<string>();
    for (const r of todayRows) {
      if (Array.isArray(r.sources_seen) && r.sources_seen.length > 0) {
        for (const s of r.sources_seen) sources.add(s);
      } else if (r.source) {
        sources.add(r.source);
      }
    }
    for (const r of batchRows) sources.add(r.source);

    // Umur: kemunculan pertama yang TERAMATI (baris baseline tertua dalam window).
    let ageDays = 0;
    if (baseRows.length > 0) {
      const oldest = baseRows.reduce((min, r) => {
        const d = utcDay(r.fetched_at);
        return d < min ? d : min;
      }, today);
      ageDays = Math.max(
        0,
        Math.round(
          (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`)) / DAY_MS
        )
      );
    }

    const { score, breakdown } = computeTrendScore({
      presentDays: days.size,
      viewsToday,
      viewsPrev,
      sourceCount: sources.size,
      appearances,
      ageDays,
    });

    const prevScore =
      prevRows.length > 0 ? Math.max(...prevRows.map((r) => Number(r.score) || 0)) : null;
    const velocityInfo =
      prevScore !== null && prevScore > 0 ? computeVelocity(score, prevScore) : null;

    const first = batchRows[0];
    planned.set(key, {
      keyword: normalizeKeyword(first.keyword),
      niche_slug: first.niche_slug,
      score,
      breakdown,
      prev_score: prevScore,
      velocity: velocityInfo ? velocityInfo.velocity : null,
      trend_direction: velocityInfo ? velocityInfo.direction : null,
    });
  }

  return planned;
}

