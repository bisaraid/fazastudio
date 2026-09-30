/**
 * Trend Insight Config — SATU tempat semua bobot & ambang model skor trend.
 *
 * Disetel dengan data nyata tanpa menyentuh logika perhitungan:
 * - `SCORE_WEIGHTS`      → total 100; tiap komponen skor maks = bobotnya.
 * - Ambang velocity      → dipakai computeVelocity() (trend-scoring).
 * - Ambang klasifikasi   → dipakai endpoint insight (Tahap 2b): "naik
 *                          konsisten", "potensi naik", "turun/basi".
 *
 * Kontrak: skor = Σ komponen, dibulatkan 1 desimal, di-clamp 0..100.
 * Komponen & input-nya disimpan di kolom `score_breakdown` (jsonb) supaya
 * "kenapa skornya segitu" bisa dijelaskan per topik.
 */

/** Bobot komponen skor (harus berjumlah 100). */
export const SCORE_WEIGHTS = {
  /** Kehadiran: fraksi hari unik dalam window yang diisi topik ini. */
  presence: 30,
  /** Momentum views: Δ log10 views vs baris kemarin (0 bila tanpa baseline). */
  views_momentum: 30,
  /** Multi-sumber: jumlah sumber berbeda hari ini (google_trends/rss/youtube/…). */
  multi_source: 15,
  /** Frekuensi: kemunculan hari ini (berapa harvest yang membawa topik ini). */
  frequency: 15,
  /** Recency: umur kemunculan pertama (topik baru lebih segar). */
  recency: 10,
} as const;

/** Jendela kehadiran (hari) — presence dihitung dari ini. */
export const PRESENCE_WINDOW_DAYS = 7;

/**
 * Pertumbuhan views yang = bobot momentum penuh.
 * log10(3) ⇒ views 3× dibanding kemarin → momentum penuh.
 */
export const VIEWS_MOMENTUM_FULL_GROWTH = Math.log10(3);

/** Jumlah sumber berbeda yang = bobot multi_source penuh. */
export const MULTI_SOURCE_FULL_COUNT = 3;

/** Kemunculan per hari yang = bobot frequency penuh (cron 4×/hari). */
export const FREQUENCY_FULL_APPEARANCES = 4;

/**
 * Recency menurut umur kemunculan pertama (hari):
 * bucket dipakai berurutan, yang pertama cocok menang.
 */
export const RECENCY_BUCKETS: ReadonlyArray<{ maxAgeDays: number; points: number }> = [
  { maxAgeDays: 1, points: 10 },
  { maxAgeDays: 3, points: 7 },
  { maxAgeDays: 7, points: 4 },
  { maxAgeDays: Infinity, points: 2 },
];

/**
 * Ambang arah tren: |velocity| ≥ threshold → up/down, selain itu stable.
 * Sumber tunggal dipakai computeVelocity() di trend-scoring.ts.
 */
export const VELOCITY_DIRECTION_THRESHOLD = 5;

// ============================================================
// Ambang klasifikasi insight (dipakai Tahap 2b, didefinisikan sekarang
// supaya satu file konfigurasi).
// ============================================================

/** "Naik konsisten": hadir ≥ N hari dalam window + presence ≥ rasio ini. */
export const CONSISTENT_MIN_DAYS = 3;
export const CONSISTENT_MIN_PRESENCE_RATIO = 0.5;

/** "Potensi naik" (early signal): topik muda + velocity ≥ ambang ini. */
export const EARLY_MAX_AGE_DAYS = 3;
export const EARLY_MIN_VELOCITY = VELOCITY_DIRECTION_THRESHOLD;

/** "Turun/basi": umur ≥ hari ini + velocity ≤ −ambang. */
export const DECAY_MIN_AGE_DAYS = 3;
export const DECAY_MAX_VELOCITY = -VELOCITY_DIRECTION_THRESHOLD;
