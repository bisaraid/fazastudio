/**
 * Konfigurasi Durasi Script — per kategori/mode.
 *
 * Diadopsi dari viraloop/src/lib/duration.ts (80 baris).
 *
 * KOMENTAR ADAPTASI:
 * - Tipe `DurationConfig` dan `DurationTier` BELUM ada di types.ts acs.
 *   Karena guardrail melarang mengubah types.ts inti di task ini, tipe
 *   didefinisikan secara LOKAL di sini. Task 7 (script-generator) dan task
 *   berikutnya bisa re-export dari sini atau dipindahkan ke types.ts nanti.
 * - Struktur kompatibel dengan category config acs (lib/categories/types.ts):
 *   kategori yang direferensikan (`affiliate`) ada di acs.
 */

// ============================================================
// TIPE DATA (lokal — belum ada di types.ts acs)
// ============================================================

export type DurationTier = 'short' | 'standard' | 'long';

export interface DurationConfig {
  id: DurationTier;
  label: string;
  description: string;
  targetWords: number;
  targetScenes: number;
  segments: number;
}

// ============================================================
// KONFIGURASI DURASI UMUM (general-purpose)
// ============================================================

export const durationConfigs: Record<DurationTier, DurationConfig> = {
  short: {
    id: 'short',
    label: '⚡ Pendek (1-3 menit) — cocok TikTok/Reels',
    description: '150-350 kata, 5-8 scene',
    targetWords: 350,
    targetScenes: 8,
    segments: 1,
  },
  standard: {
    id: 'standard',
    label: '📖 Standar (5 menit) — cerita lebih lengkap',
    description: '600-750 kata, 10-15 scene',
    targetWords: 750,
    targetScenes: 15,
    segments: 2,
  },
  long: {
    id: 'long',
    label: '🎬 Panjang (15+ menit) — konten mendalam',
    description: '2000-2500 kata, 30-40+ scene',
    targetWords: 2500,
    targetScenes: 40,
    segments: 5,
  },
};

// ============================================================
// KONFIGURASI DURASI KHUSUS AFFILIATE
// ============================================================
// Affiliate-specific — belum tentu dipakai di acs sekarang.
// Tier berbeda dari kategori lain:
// - short: 30 detik (~60-90 kata, 2-3 scene), 1 produk
// - standard: 1 menit (~120-180 kata, 4-5 scene), 1 produk
// - long: 3 menit (~350-450 kata, 8-10 scene), MODE PERBANDINGAN 2-3 produk

export const affiliateDurationConfigs: Record<DurationTier, DurationConfig> = {
  short: {
    id: 'short',
    label: '⚡ Cepat (30 detik) — quick pitch produk',
    description: '60-90 kata, 2-3 scene — 1 produk',
    targetWords: 90,
    targetScenes: 3,
    segments: 1,
  },
  standard: {
    id: 'standard',
    label: '📖 Standar (1 menit) — review lebih detail',
    description: '120-180 kata, 4-5 scene — 1 produk',
    targetWords: 180,
    targetScenes: 5,
    segments: 1,
  },
  long: {
    id: 'long',
    label: '⚖️ Bandingkan (3 menit) — 2-3 produk sekaligus',
    description: '350-450 kata, 8-10 scene — 2-3 produk',
    targetWords: 450,
    targetScenes: 10,
    segments: 2,
  },
};

export const durationOptions = Object.values(durationConfigs);

export function getDurationConfig(id: DurationTier): DurationConfig {
  return durationConfigs[id];
}

/**
 * Ambil konfigurasi durasi PER KATEGORI.
 * Untuk affiliate, return config khusus (30 detik/1 menit/3 menit).
 * Untuk kategori lain, fallback ke getDurationConfig() yang lama.
 */
export function getDurationConfigForCategory(categoryId: string, id: DurationTier): DurationConfig {
  if (categoryId === 'affiliate') {
    return affiliateDurationConfigs[id];
  }
  return durationConfigs[id];
}