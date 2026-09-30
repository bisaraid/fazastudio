/**
 * Trend Harvest — SATU jalur harvest dipakai GitHub Actions (sumber kebenaran)
 * DAN route Vercel /api/cron/trends (trigger manual). Perilaku identik.
 *
 * Alur:
 *  1. Fetch paralel: YouTube ID (top-50), Google Trends, RSS (8 feed) —
 *     YouTube US menyusul + jeda (pembatas kuota API).
 *  2. Ekstraksi topik SEQUENTIAL per source dengan jeda antar batch Groq
 *     (mitigasi 429 — lihat commit bf766d2/b0342a6; RSS dulu di-skip saat
 *     ekstraksi masih paralel, sekarang aman karena sudah serial + backoff).
 *  3. US: ekstrak topik dulu, lalu translateMany (batch, dibatasi) ke ID.
 *  4. Normalisasi keyword → SATU baseline fetch (7 hari, paged) →
 *     planBatchScores() → upsert RPC (score/velocity) + 1 UPDATE per key
 *     (score_breakdown + prev_score) — tanpa migrasi (kolom sudah ada).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchYouTubeTrending, SOURCE_YOUTUBE } from "./trend-youtube";
import { extractTopicsFromTitles } from "./topic-extractor";
import { fetchGoogleTrends } from "./harvest-google-trends";
import { fetchRssTitles } from "./harvest-rss";
import { translateMany } from "./translate";
import { describeSupabaseError, formatSupabaseError } from "./db-error";
import {
  normalizeKeyword,
  planBatchScores,
  scoreKey,
  type HarvestBatchRow,
  type BaselineRow,
} from "./trend-insight";
import { PRESENCE_WINDOW_DAYS } from "./trend-insight-config";

export const SOURCE_GOOGLE_TRENDS = "google_trends";
export const SOURCE_RSS = "rss";
export const SOURCE_YOUTUBE_US = "youtube_us";

export interface HarvestOptions {
  now?: Date;
  /** Aktifkan RSS (default true — sudah aman: ekstraksi serial + retry 429). */
  enableRss?: boolean;
  /** Aktifkan early-signal YouTube US (default true, dibatasi kuota). */
  enableYoutubeUs?: boolean;
  topVideosId?: number;
  /** Kuota US: video lebih sedikit dari ID (hemat terjemahan Groq). */
  topVideosUs?: number;
  /** Batas judul US yang diterjemahkan per run (Groq token cap). */
  translateUsMax?: number;
  /** Jeda antar batch Groq (deteksi 429 tetap via retry-After). */
  groqDelayMs?: number;
  /** Jeda sebelum request YouTube US (pagu rate API). */
  usRequestDelayMs?: number;
}

export interface HarvestSummary {
  fetched: { youtubeId: number; youtubeUs: number; googleTrends: number; rss: number };
  extracted: { rss: number; youtube: number; googleTrends: number; youtubeUs: number };
  /** Jumlah baris batch (key unik = jumlah upsert rencana). */
  batchRows: number;
  inserted: number;
  /** Baris baseline yang berhasil dibaca (7 hari terakhir, sesuai key batch). */
  baselineRows: number;
  byNiche: Array<{ niche: string; count: number }>;
  velocity: { up: number; stable: number; down: number; none: number };
  /** Pesan kegagalan (tanpa PII) — kosong bila bersih. */
  errors: string[];
}

const DEFAULTS = {
  enableRss: true,
  enableYoutubeUs: true,
  topVideosId: 50,
  topVideosUs: 25,
  translateUsMax: 25,
  groqDelayMs: 5000,
  usRequestDelayMs: 1000,
} as const;

const BASELINE_PAGE_SIZE = 1000;
const BASELINE_MAX_PAGES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function startOfUtcDay(iso: string): string {
  return `${iso.slice(0, 10)}T00:00:00.000Z`;
}

/** Fetch seluruh sumber — paralel, US menyusul dengan jeda (kuota). */
async function fetchSources(opts: Required<Pick<HarvestOptions, keyof typeof DEFAULTS>>) {
  const settled = await Promise.allSettled([
    fetchYouTubeTrending(opts.topVideosId, "ID"),
    fetchGoogleTrends(),
    opts.enableRss ? fetchRssTitles() : Promise.resolve([] as string[]),
  ]);
  const idRes = settled[0].status === "fulfilled" ? settled[0].value : null;
  const gtTitles =
    settled[1].status === "fulfilled" ? settled[1].value : ([] as string[]);
  const rssTitles =
    settled[2].status === "fulfilled" ? settled[2].value : ([] as string[]);

  let usTitles: string[] = [];
  if (opts.enableYoutubeUs) {
    await sleep(opts.usRequestDelayMs);
    const usRes = await fetchYouTubeTrending(opts.topVideosUs, "US").catch(() => null);
    usTitles = (usRes?.data ?? []).map((v) => v.title.trim()).filter(Boolean);
  }

  const idTitles: string[] = [];
  const idVideos = (idRes?.data ?? []).filter((v) => v.title.trim() !== "");
  for (const v of idVideos) idTitles.push(v.title.trim());

  return {
    idRes,
    idVideos,
    idTitles,
    gtTitles,
    rssTitles,
    usTitles,
    failed: !idRes || !idRes.success,
  };
}


/** Baris siap upsert — HarvestBatchRow + metadata YouTube (opsional). */
interface UpsertRow extends HarvestBatchRow {
  youtube_video_id: string | null;
  youtube_title: string | null;
  youtube_channel: string | null;
  youtube_likes: number;
  youtube_uploaded_at: string | null;
}

/**
 * Baseline SATU langkah untuk seluruh batch: baris 7 hari terakhir pada
 * niche-niche yang disentuh batch (paged; dicocokkan in-memory dengan
 * scoreKey sehingga varian kapitalisasi lama tetap ketemu — dampak
 * normalisasi ke data lama tidak memutus deret velocity/presence).
 */
async function fetchBaseline(
  supabase: SupabaseClient,
  cutoffIso: string,
  niches: string[]
): Promise<{ rows: BaselineRow[]; errors: string[] }> {
  const rows: BaselineRow[] = [];
  const errors: string[] = [];
  if (niches.length === 0) return { rows, errors };

  for (let page = 0; page < BASELINE_MAX_PAGES; page++) {
    const offset = page * BASELINE_PAGE_SIZE;
    const { data, error } = await supabase
      .from("trend_ideas")
      .select(
        "keyword, niche_slug, fetched_at, score, youtube_views, appearances, source_count, source, sources_seen, first_seen_at"
      )
      .gte("fetched_at", cutoffIso)
      .in("niche_slug", niches)
      .order("fetched_at", { ascending: false })
      .range(offset, offset + BASELINE_PAGE_SIZE - 1);

    if (error) {
      errors.push(`baseline: ${formatSupabaseError(describeSupabaseError(error))}`);
      break;
    }
    rows.push(...(data as unknown as BaselineRow[]));
    if (!data || data.length < BASELINE_PAGE_SIZE) break;
    if (page === BASELINE_MAX_PAGES - 1) {
      errors.push(`baseline: terpotong di ${BASELINE_MAX_PAGES * BASELINE_PAGE_SIZE} baris`);
    }
  }
  return { rows, errors };
}

/** Satu UPDATE per key: score_breakdown + prev_score (di luar param RPC 024). */
async function writeScoreExplain(
  supabase: SupabaseClient,
  keyword: string,
  niche: string,
  breakdown: unknown,
  prevScore: number | null,
  dayStartIso: string
): Promise<string | null> {
  const nextDay = new Date(Date.parse(dayStartIso) + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("trend_ideas")
    .update({
      score_breakdown: breakdown,
      prev_score: prevScore,
    })
    .eq("keyword", keyword)
    .eq("niche_slug", niche)
    .gte("fetched_at", dayStartIso)
    .lt("fetched_at", nextDay);
  if (error) return formatSupabaseError(describeSupabaseError(error));
  return null;
}

/**
 * Jalur harvest tunggal. Dipanggil scripts/harvest.ts (GH Actions) dan
 * src/app/api/cron/trends/route.ts (trigger manual) — perilaku identik.
 * Tidak pernah melempar: kegagalan per langkah masuk `summary.errors`.
 */
export async function runTrendHarvest(
  supabase: SupabaseClient,
  options: HarvestOptions = {}
): Promise<HarvestSummary> {
  const opts = { ...DEFAULTS, ...options };
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const dayStartIso = startOfUtcDay(nowIso);

  const summary: HarvestSummary = {
    fetched: { youtubeId: 0, youtubeUs: 0, googleTrends: 0, rss: 0 },
    extracted: { rss: 0, youtube: 0, googleTrends: 0, youtubeUs: 0 },
    batchRows: 0,
    inserted: 0,
    baselineRows: 0,
    byNiche: [],
    velocity: { up: 0, stable: 0, down: 0, none: 0 },
    errors: [],
  };

  // ===== 1. Fetch sumber (paralel; US menyusul dengan jeda) =====
  const sources = await fetchSources(opts);
  summary.fetched.youtubeId = sources.idTitles.length;
  summary.fetched.youtubeUs = sources.usTitles.length;
  summary.fetched.googleTrends = sources.gtTitles.length;
  summary.fetched.rss = sources.rssTitles.length;
  if (sources.failed) summary.errors.push("youtube id: fetch gagal/success=false");

  // ===== 2. Ekstraksi topik SEQUENTIAL + jeda (mitigasi Groq 429) =====
  const batches: Array<{ source: string; titles: string[] }> = [];
  if (opts.enableRss && sources.rssTitles.length > 0) {
    batches.push({ source: SOURCE_RSS, titles: sources.rssTitles });
  }
  if (sources.idTitles.length > 0) {
    batches.push({ source: SOURCE_YOUTUBE, titles: sources.idTitles });
  }
  if (sources.gtTitles.length > 0) {
    batches.push({ source: SOURCE_GOOGLE_TRENDS, titles: sources.gtTitles });
  }
  if (opts.enableYoutubeUs && sources.usTitles.length > 0) {
    batches.push({ source: SOURCE_YOUTUBE_US, titles: sources.usTitles });
  }

  const extractedBySource = new Map<string, Array<{ topic: string; niche: string; index: number }>>();
  for (const b of batches) {
    await sleep(opts.groqDelayMs);
    const items = await extractTopicsFromTitles(b.titles);
    extractedBySource.set(
      b.source,
      items.map((i) => ({ topic: i.topic, niche: i.niche, index: i.index }))
    );
    if (b.source === SOURCE_RSS) summary.extracted.rss = items.length;
    else if (b.source === SOURCE_YOUTUBE) summary.extracted.youtube = items.length;
    else if (b.source === SOURCE_GOOGLE_TRENDS) summary.extracted.googleTrends = items.length;
    else summary.extracted.youtubeUs = items.length;
  }

  // ===== 2b. US: translate topik → ID (batch, dibatasi translateUsMax) =====
  const usItems = extractedBySource.get(SOURCE_YOUTUBE_US) ?? [];
  if (usItems.length > 0) {
    await sleep(opts.groqDelayMs);
    const cap = opts.translateUsMax;
    const translated = await translateMany(usItems.slice(0, cap).map((i) => i.topic));
    for (let i = 0; i < translated.length; i++) {
      usItems[i].topic = translated[i];
    }
    summary.extracted.youtubeUs = usItems.length;
  }

  // ===== 3. Bangun baris batch — keyword ternormalisasi =====
  const upsertRows: UpsertRow[] = [];
  let skipped = 0;
  for (const [source, items] of extractedBySource) {
    for (const item of items) {
      const keyword = normalizeKeyword(item.topic);
      if (!keyword || !item.niche) {
        skipped++;
        continue;
      }
      const video =
        source === SOURCE_YOUTUBE && sources.idVideos[item.index]
          ? sources.idVideos[item.index]
          : null;
      upsertRows.push({
        keyword,
        niche_slug: item.niche,
        source,
        youtube_views: video?.viewCount ?? 0,
        youtube_video_id: video?.videoId ?? null,
        youtube_title: video?.title ?? item.topic,
        youtube_channel: video?.channelTitle ?? null,
        youtube_likes: video?.likeCount ?? 0,
        youtube_uploaded_at: video?.publishedAt ?? null,
        // youtube_us: metadata sengaja null (judul sudah diterjemahkan; video
        // hanya dicari utk source youtube, jadi utk youtube_us field tetap null;
        // views US tidak dicampur ke deret views ID agar momentum murni ID).
      });
    }
  }
  summary.batchRows = upsertRows.length;
  if (skipped > 0) {
    summary.errors.push(`${skipped} topik dilewati (keyword/niche kosong)`);
  }
  if (upsertRows.length === 0) {
    return summary;
  }

  // ===== 4. SATU baseline per batch → skor + velocity per key =====
  const niches = Array.from(new Set(upsertRows.map((r) => r.niche_slug)));
  const cutoffIso = new Date(
    now.getTime() - (PRESENCE_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000
  ).toISOString();
  const baseline = await fetchBaseline(supabase, `${cutoffIso.slice(0, 10)}T00:00:00.000Z`, niches);
  summary.baselineRows = baseline.rows.length;
  summary.errors.push(...baseline.errors);

  const planned = planBatchScores(upsertRows, baseline.rows, now);
  for (const p of planned.values()) {
    if (p.trend_direction === "up") summary.velocity.up++;
    else if (p.trend_direction === "down") summary.velocity.down++;
    else if (p.trend_direction === "stable") summary.velocity.stable++;
    else summary.velocity.none++;
  }

  // ===== 5. Upsert per baris (RPC 024: score + velocity + direction) =====
  const byNicheCount = new Map<string, number>();
  for (const row of upsertRows) {
    const p = planned.get(scoreKey(row.keyword, row.niche_slug));
    if (!p) continue;
    const { error } = await supabase.rpc("upsert_trend_row", {
      p_keyword: row.keyword,
      p_niche_slug: row.niche_slug,
      p_source: row.source,
      p_score: p.score,
      p_velocity: p.velocity,
      p_trend_direction: p.trend_direction,
      p_youtube_video_id: row.youtube_video_id,
      p_youtube_title: row.youtube_title,
      p_youtube_channel: row.youtube_channel,
      p_youtube_views: row.youtube_views,
      p_youtube_likes: row.youtube_likes,
      p_youtube_uploaded_at: row.youtube_uploaded_at,
      p_fetched_at: nowIso,
    });
    if (error) {
      summary.errors.push(
        `upsert ${row.niche_slug}: ${formatSupabaseError(describeSupabaseError(error))}`
      );
      continue;
    }
    summary.inserted++;
    byNicheCount.set(row.niche_slug, (byNicheCount.get(row.niche_slug) ?? 0) + 1);
  }

  // ===== 5b. UPDATE per key: score_breakdown + prev_score (penjelas skor) =====
  for (const p of planned.values()) {
    const err = await writeScoreExplain(
      supabase,
      p.keyword,
      p.niche_slug,
      p.breakdown,
      p.prev_score,
      dayStartIso
    );
    if (err) summary.errors.push(`explain ${p.niche_slug}: ${err}`);
  }

  summary.byNiche = Array.from(byNicheCount.entries())
    .map(([niche, count]) => ({ niche, count }))
    .sort((a, b) => b.count - a.count);

  return summary;
}
