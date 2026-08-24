/**
 * Validasi environment variables saat startup
 * Me-throw error jelas jika ada yang kosong
 *
 * Diadopsi dari viraloop/src/lib/env.ts (63 baris).
 *
 * SKIP (env var yang tidak relevan untuk acs):
 * - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — diganti REDIS_URL (self-hosted)
 * - KV_REST_API_URL / KV_REST_API_TOKEN — Vercel KV, tidak dipakai
 * - GOOGLE_CSE_ID / GOOGLE_CSE_API_KEY — fitur scrape review produk, belum diadopsi
 * - BROWSERLESS_API_KEY — fitur scraping browser, belum diadopsi
 * - TRENDTRACKER_API_URL — fitur trending product affiliate, belum diadopsi
 */

const REQUIRED_VARS = [
  'GROQ_API_KEY',
  'API_SECRET_KEY',
  'REDIS_URL',
] as const;

const OPTIONAL_VARS = [
  'CARTESIA_API_KEY',
  'ELEVENLABS_API_KEY',
  'GOOGLE_TTS_API_KEY',
  'GROQ_MODEL',
  'APP_DOMAIN',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'AI_FALLBACK_ENABLED',
  'TRENDTRACKER_API_KEY',
  'TRENDTRACKER_API_URL',
] as const;

function validateEnv(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key] || process.env[key]!.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `❌ Environment variables wajib berikut tidak ditemukan:\n` +
      missing.map(k => `   - ${k}`).join('\n') +
      `\n\nBuat file .env di root proyek dan isi nilai-nilai tersebut. ` +
      `Lihat .env.example sebagai referensi.`
    );
  }

  // Warn for optional vars that are empty
  for (const key of OPTIONAL_VARS) {
    if (!process.env[key] || process.env[key]!.trim() === '') {
      console.warn(`⚠️  ${key} tidak diset — fitur terkait akan dinonaktifkan`);
    }
  }
}

export function getRequiredEnvVar(key: (typeof REQUIRED_VARS)[number]): string {
  return process.env[key]!;
}

export function getOptionalEnvVar(key: (typeof OPTIONAL_VARS)[number], defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

// Auto-validate on import
validateEnv();