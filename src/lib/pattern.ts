/**
 * Pattern Tagging — Tag content_samples dengan pola sederhana dari judul & durasi.
 *
 * Fungsi ini murni menggunakan regex/rule, TIDAK memanggil AI apapun.
 *
 * Output: { hook_type, duration_bucket, title_length_bucket }
 *
 * Diadopsi dari viraloop/src/lib/pattern.ts (140 baris).
 * Tidak ada import — murni standalone.
 */

// ============================================================
// KATA KUNCI CLICKBAIT PER KATEGORI
// ============================================================

const CLICKBAIT_WORDS = {
  /** Kata yang mengindikasikan pengungkapan / kejutan */
  ungkap: [
    'ternyata', 'rahasia', 'terungkap', 'mengungkap', 'dibalik',
    'fakta', 'kenyataannya', 'sebenarnya', 'bukti', 'fakta unik',
  ],
  /** Kata yang memicu rasa penasaran / FOMO */
  penasaran: [
    'jangan', 'wajib', 'harus', 'stop', 'berhenti', 'hindari',
    'hati-hati', 'awas', 'pernah', 'coba', 'lihat',
  ],
  /** Kata yang menjanjikan sesuatu */
  janji: [
    'ampuh', 'manjur', 'berhasil', 'sukses', 'cara', 'tips',
    'trik', 'rahasia', 'langkah', 'panduan', 'solusi',
  ],
  /** Kata yang menekankan urgensi / waktu */
  urgensi: [
    'sekarang', 'hari ini', 'malam ini', 'detik', 'menit',
    'saatnya', 'waktunya', 'jangan sampai',
  ],
  /** Kata yang melibatkan emosi kuat */
  emosi: [
    'baper', 'nangis', 'sedih', 'haru', 'ngeri', 'seram',
    'menyeramkan', 'mengerikan', 'shock', 'kaget', 'terkejut',
    'merinding', 'brutal', 'gila', 'luar biasa',
  ],
};

/** Semua kata clickbait (flat) untuk deteksi umum */
const ALL_CLICKBAIT_WORDS = Object.values(CLICKBAIT_WORDS).flat();

// ============================================================
// TIPE DATA
// ============================================================

export interface PatternTags {
  hook_type: 'pertanyaan' | 'angka' | 'clickbait_kata' | 'netral';
  duration_bucket: '0-15s' | '15-30s' | '30-60s' | '60s+';
  title_length_bucket: 'short' | 'medium' | 'long';
}

export interface SampleInput {
  title: string;
  duration_seconds: number | null;
}

// ============================================================
// FUNGSI DETEKSI
// ============================================================

/**
 * Deteksi hook_type dari title.
 * Urutan prioritas: pertanyaan > angka > clickbait_kata > netral
 * 
 * Diexport agar bisa dipakai untuk tagging static hookAngles di script-generator.
 */
export function detectHookType(title: string): PatternTags['hook_type'] {
  const normalized = title.trim();

  // 1. Pertanyaan — mengandung tanda tanya (termasuk Unicode variant)
  //    U+003F = standard ?, U+FF1F = fullwidth ？, U+061F = Arabic ؟
  //    U+2753 = ❓ red question mark, U+2754 = ❔ white question mark
  //    U+2049 = ⁉ exclamation-question mark (common in titles)
  if (/[\u003F\uFF1F\u061F\u2753\u2754\u2049]/.test(normalized)) {
    return 'pertanyaan';
  }

  // 2. Angka — diawali digit (0-9)
  if (/^\d/.test(normalized)) {
    return 'angka';
  }

  // 3. Clickbait kata — mengandung kata-kata tertentu
  const lower = normalized.toLowerCase();
  for (const word of ALL_CLICKBAIT_WORDS) {
    if (lower.includes(word)) {
      return 'clickbait_kata';
    }
  }

  // 4. Netral — tidak terdeteksi pola apapun
  return 'netral';
}

/**
 * Kategorikan durasi dalam detik ke bucket.
 */
function detectDurationBucket(durationSeconds: number | null): PatternTags['duration_bucket'] {
  if (durationSeconds === null || durationSeconds === 0) {
    return '30-60s'; // default fallback
  }
  if (durationSeconds <= 15) return '0-15s';
  if (durationSeconds <= 30) return '15-30s';
  if (durationSeconds <= 60) return '30-60s';
  return '60s+';
}

/**
 * Kategorikan panjang judul.
 * short: 0-40 karakter
 * medium: 41-80 karakter
 * long: 80+ karakter
 */
function detectTitleLengthBucket(title: string): PatternTags['title_length_bucket'] {
  const len = title.trim().length;
  if (len <= 40) return 'short';
  if (len <= 80) return 'medium';
  return 'long';
}

// ============================================================
// MAIN FUNCTION
// ============================================================

/**
 * Tag sebuah content sample dengan pola sederhana.
 *
 * @param sample - Objek yang memiliki title dan duration_seconds
 * @returns PatternTags — objek dengan hook_type, duration_bucket, title_length_bucket
 */
export function tagPattern(sample: SampleInput): PatternTags {
  return {
    hook_type: detectHookType(sample.title),
    duration_bucket: detectDurationBucket(sample.duration_seconds),
    title_length_bucket: detectTitleLengthBucket(sample.title),
  };
}