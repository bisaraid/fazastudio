import { test, expect, describe } from "vitest";

// ============================================================
// Regresi Tahap 2a — model skor trend (bobot di trend-insight-config):
//  1. normalisasi keyword (deret harian nyambung di unique index),
//  2. skor TIAP komponen (presence, momentum, multi-source, frequency, recency),
//  3. kasus data kosong (belum ada apa-apa),
//  4. baseline kemarin tidak ada → velocity null (bukan 0/NaN),
//  5. baseline legacy (score kemarin 0) → tidak dianggap baseline velocity.
// Semua fungsi murni — tanpa jaringan/DB.
// ============================================================

import {
  computeTrendScore,
  normalizeKeyword,
  planBatchScores,
  scoreKey,
} from "@/lib/trend-insight";
import {
  PRESENCE_WINDOW_DAYS,
  SCORE_WEIGHTS,
  VIEWS_MOMENTUM_FULL_GROWTH,
} from "@/lib/trend-insight-config";

// ============================================================
// 1. Normalisasi keyword
// ============================================================

describe("normalizeKeyword", () => {
  test("lowercase + trim + spasi ganda jadi 1 spasi", () => {
    expect(normalizeKeyword("  Cara Bikin   Skincare glowing  ")).toBe(
      "cara bikin skincare glowing"
    );
    expect(normalizeKeyword("REVIEW\thp\nbudget")).toBe("review hp budget");
  });

  test("karakter kosong → '' (baris dibuang oleh harvest)", () => {
    expect(normalizeKeyword("")).toBe("");
    expect(normalizeKeyword("   ")).toBe("");
    expect(normalizeKeyword("\n\t ")).toBe("");
  });

  test("dua varian lama (beda kapitalisasi/spasi) → key sama → deret nyambung", () => {
    expect(normalizeKeyword("Cara Makan Sehat")).toBe(normalizeKeyword("cara  makan sehat"));
    expect(scoreKey("Cara Makan Sehat", "makanan")).toBe(scoreKey("cara makan sehat", "makanan"));
  });
});

// ============================================================
// 2. Skor per komponen (bobot diketahui dari config)
// ============================================================

describe("computeTrendScore — per komponen", () => {
  test("presence: 7/7 hari → bobot penuh; 0 hari → 0", () => {
    const penuh = computeTrendScore({
      presentDays: PRESENCE_WINDOW_DAYS,
      viewsToday: 0,
      viewsPrev: null,
      sourceCount: 0,
      appearances: 0,
      ageDays: 0,
    });
    expect(penuh.breakdown.presence).toBe(SCORE_WEIGHTS.presence);

    const kosong = computeTrendScore({
      presentDays: 0,
      viewsToday: 0,
      viewsPrev: null,
      sourceCount: 0,
      appearances: 0,
      ageDays: 0,
    });
    expect(kosong.breakdown.presence).toBe(0);
  });

  test("views_momentum: views naik 3× → bobot penuh (log10(3)=ambang)", () => {
    const prevViews = 1000;
    const todayViews =
      Math.round((prevViews + 1) * Math.pow(10, VIEWS_MOMENTUM_FULL_GROWTH)) - 1;
    const r = computeTrendScore({
      presentDays: 0,
      viewsToday: todayViews,
      viewsPrev: prevViews,
      sourceCount: 0,
      appearances: 0,
      ageDays: 0,
    });
    expect(r.breakdown.views_momentum).toBeCloseTo(SCORE_WEIGHTS.views_momentum, 0);
  });

  test("views_momentum: views turun → 0 (clamp), tanpa baseline → 0", () => {
    const turun = computeTrendScore({
      presentDays: 0,
      viewsToday: 500,
      viewsPrev: 50000,
      sourceCount: 0,
      appearances: 0,
      ageDays: 0,
    });
    expect(turun.breakdown.views_momentum).toBe(0);

    const tanpaBaseline = computeTrendScore({
      presentDays: 0,
      viewsToday: 999999,
      viewsPrev: null,
      sourceCount: 0,
      appearances: 0,
      ageDays: 0,
    });
    expect(tanpaBaseline.breakdown.views_momentum).toBe(0);
    expect(tanpaBaseline.breakdown.inputs.views_prev).toBeNull();
  });

  test("multi_source: 3 sumber → bobot penuh; 6 sumber tetap di-cap", () => {
    const base = { presentDays: 0, viewsToday: 0, viewsPrev: null, appearances: 0, ageDays: 0 };
    expect(computeTrendScore({ ...base, sourceCount: 3 }).breakdown.multi_source).toBe(
      SCORE_WEIGHTS.multi_source
    );
    expect(computeTrendScore({ ...base, sourceCount: 6 }).breakdown.multi_source).toBe(
      SCORE_WEIGHTS.multi_source
    );
    expect(computeTrendScore({ ...base, sourceCount: 0 }).breakdown.multi_source).toBe(0);
  });

  test("frequency: 4 kemunculan/hari → bobot penuh; di atas itu di-cap", () => {
    const base = { presentDays: 0, viewsToday: 0, viewsPrev: null, sourceCount: 0, ageDays: 0 };
    expect(computeTrendScore({ ...base, appearances: 4 }).breakdown.frequency).toBe(
      SCORE_WEIGHTS.frequency
    );
    expect(computeTrendScore({ ...base, appearances: 9 }).breakdown.frequency).toBe(
      SCORE_WEIGHTS.frequency
    );
    expect(computeTrendScore({ ...base, appearances: 1 }).breakdown.frequency).toBeCloseTo(
      SCORE_WEIGHTS.frequency / 4,
      1
    );
  });

  test("recency: umur 0/1 hari → penuh, umur 30 hari → bucket terendah", () => {
    const base = { presentDays: 0, viewsToday: 0, viewsPrev: null, sourceCount: 0, appearances: 0 };
    expect(computeTrendScore({ ...base, ageDays: 0 }).breakdown.recency).toBe(10);
    expect(computeTrendScore({ ...base, ageDays: 1 }).breakdown.recency).toBe(10);
    const tua = computeTrendScore({ ...base, ageDays: 30 }).breakdown.recency;
    expect(tua).toBeGreaterThan(0);
    expect(tua).toBeLessThan(10);
  });

  test("skor total = jumlah komponen, di-clamp 0..100, 1 desimal", () => {
    const r = computeTrendScore({
      presentDays: 7,
      viewsToday: 10_000_000,
      viewsPrev: 1,
      sourceCount: 5,
      appearances: 10,
      ageDays: 0,
    });
    const sum =
      r.breakdown.presence +
      r.breakdown.views_momentum +
      r.breakdown.multi_source +
      r.breakdown.frequency +
      r.breakdown.recency;
    expect(r.score).toBe(Math.min(100, Math.round(sum * 10) / 10));
    expect(r.score).toBeLessThanOrEqual(100);
  });

  test("breakdown.inputs mencatat semua angka mentah (jejak audit skor)", () => {
    const r = computeTrendScore({
      presentDays: 3,
      viewsToday: 700,
      viewsPrev: 100,
      sourceCount: 2,
      appearances: 4,
      ageDays: 2,
    });
    expect(r.breakdown.inputs).toEqual({
      present_days: 3,
      window_days: PRESENCE_WINDOW_DAYS,
      views_today: 700,
      views_prev: 100,
      source_count: 2,
      appearances: 4,
      age_days: 2,
    });
    const totalKomponen =
      r.breakdown.presence +
      r.breakdown.views_momentum +
      r.breakdown.multi_source +
      r.breakdown.frequency +
      r.breakdown.recency;
    expect(r.score).toBe(Math.round(totalKomponen * 10) / 10);
  });
});

// ============================================================
// 3. Kasus data kosong
// ============================================================

describe("computeTrendScore — data kosong", () => {
  test("semua input 0/null → skor finite 0..100, tanpa NaN, breakdown lengkap", () => {
    const r = computeTrendScore({
      presentDays: 0,
      viewsToday: 0,
      viewsPrev: null,
      sourceCount: 0,
      appearances: 0,
      ageDays: 0,
    });
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.breakdown.presence).toBe(0);
    expect(r.breakdown.views_momentum).toBe(0);
    expect(r.breakdown.multi_source).toBe(0);
    expect(r.breakdown.frequency).toBe(0);
    // recency umur 0 → tetap ada poin (topik baru = segar) — bukan NaN.
    expect(r.breakdown.recency).toBe(10);
  });
});

// ============================================================
// 4-5. planBatchScores: baseline kemarin ada / tidak ada / legacy
// ============================================================

const NOW = new Date("2026-09-30T10:00:00.000Z");
const HARI_INI = "2026-09-30";
const KEMARIN = "2026-09-29";

function batchRow(over: Partial<Parameters<typeof planBatchScores>[0][number]> = {}) {
  return {
    keyword: "Cara Bikin Skincare",
    niche_slug: "skincare",
    source: "youtube",
    youtube_views: 1000,
    ...over,
  };
}

function baselineRow(over: Partial<Parameters<typeof planBatchScores>[1][number]> = {}) {
  return {
    keyword: "cara bikin skincare",
    niche_slug: "skincare",
    fetched_at: `${KEMARIN}T06:00:00.000Z`,
    score: 42,
    youtube_views: 1000,
    appearances: 2,
    source_count: 1,
    source: "youtube",
    sources_seen: ["youtube"],
    first_seen_at: `${KEMARIN}T06:00:00.000Z`,
    ...over,
  };
}

describe("planBatchScores — baseline satu langkah per batch", () => {
  test("baseline kemarin ada → prev_score + velocity + arah terisi", () => {
    const planned = planBatchScores([batchRow()], [baselineRow()], NOW);
    const p = planned.get("cara bikin skincare|skincare");
    expect(p).toBeDefined();
    expect(p!.prev_score).toBe(42);
    // Velocity = Δ skor vs kemarin (bisa negatif bila skor turun).
    expect(p!.velocity).not.toBeNull();
    expect(["up", "stable", "down"]).toContain(p!.trend_direction);
    // Keyword batch yang beda kapitalisasi tetap cocokkan baseline.
    expect(p!.keyword).toBe("cara bikin skincare");
    // velocity = selisih skor, konsisten dengan computeVelocity (round1).
    expect(p!.velocity).toBeCloseTo(p!.score - 42, 1);
  });

  test("baseline kemarin TIDAK ada → prev_score & velocity null (bukan 0/NaN)", () => {
    const planned = planBatchScores([batchRow()], [], NOW);
    const p = planned.get("cara bikin skincare|skincare")!;
    expect(p.prev_score).toBeNull();
    expect(p.velocity).toBeNull();
    expect(p.trend_direction).toBeNull();
    expect(Number.isFinite(p.score)).toBe(true);
    expect(p.breakdown.inputs.views_prev).toBeNull();
  });

  test("baseline legacy (score kemarin 0) → velocity null, prev_score tetap 0", () => {
    const planned = planBatchScores([batchRow()], [baselineRow({ score: 0 })], NOW);
    const p = planned.get("cara bikin skincare|skincare")!;
    expect(p.prev_score).toBe(0);
    expect(p.velocity).toBeNull();
    expect(p.trend_direction).toBeNull();
  });

  test("presence & appearances terakumulasi dari baseline 7 hari + batch", () => {
    const lama = [
      baselineRow({ fetched_at: "2026-09-24T06:00:00.000Z" }),
      baselineRow({ fetched_at: "2026-09-26T06:00:00.000Z" }),
      baselineRow({ fetched_at: `${KEMARIN}T06:00:00.000Z` }),
      baselineRow({ fetched_at: `${HARI_INI}T04:00:00.000Z`, appearances: 3 }),
    ];
    const planned = planBatchScores([batchRow()], lama, NOW);
    const p = planned.get("cara bikin skincare|skincare")!;
    // 24, 26, 29, 30 → 4 hari unik dalam window 7 hari.
    expect(p.breakdown.inputs.present_days).toBe(4);
    // appearances hari ini: 3 (baseline) + 1 (batch) = 4.
    expect(p.breakdown.inputs.appearances).toBe(4);
    expect(p.breakdown.inputs.age_days).toBe(6);
  });

  test("sumber hari ini = union sources_seen baseline + sumber batch", () => {
    const rows = [
      baselineRow({
        fetched_at: `${HARI_INI}T04:00:00.000Z`,
        sources_seen: ["youtube", "google_trends"],
        source_count: 2,
      }),
    ];
    const planned = planBatchScores([batchRow({ source: "rss" })], rows, NOW);
    const p = planned.get("cara bikin skincare|skincare")!;
    expect(p.breakdown.inputs.source_count).toBe(3);
  });

  test("batch multi-key → satu Map berisi semua key (bukan per topik berulang)", () => {
    const planned = planBatchScores(
      [
        batchRow(),
        batchRow({ keyword: "Resep Sambal Enak", niche_slug: "makanan", source: "rss", youtube_views: 0 }),
      ],
      [],
      NOW
    );
    expect(planned.size).toBe(2);
    expect(planned.has("cara bikin skincare|skincare")).toBe(true);
    expect(planned.has("resep sambal enak|makanan")).toBe(true);
  });
});
