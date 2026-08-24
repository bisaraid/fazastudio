/**
 * Key Rotation System — ACS TTS
 *
 * Membaca multiple API keys dari env vars dengan pola:
 *   {PREFIX}_API_KEY_1, {PREFIX}_VOICE_ID_1
 *   {PREFIX}_API_KEY_2, {PREFIX}_VOICE_ID_2
 *   ... dst (sampai index yang tidak ketemu)
 *
 * Strategi:
 * - getRandomKey: pilih key secara random (cocok untuk serverless karena
 *   counter round-robin tidak persistent antar instance).
 * - executeWithRotation: coba key satu per satu. Hanya retry key lain untuk
 *   error 401 (unauthorized) atau 429 (rate limit). Error lain langsung throw.
 *
 * Round-robin lama di tts/index.ts TIDAK dihapus — tetap dipakai sebagai
 * fallback jika key rotation tidak tersedia.
 */

export interface ProviderKey {
  apiKey: string;
  voiceId?: string;
  index: number;
}

/**
 * Load semua key yang tersedia untuk suatu provider.
 * Loop dari index 1 sampai tidak ketemu env var berikutnya.
 *
 * @param prefix - Base prefix env var, contoh: "ELEVENLABS" → membaca
 *   ELEVENLABS_API_KEY_1, ELEVENLABS_VOICE_ID_1, ...
 * @returns Array of ProviderKey
 */
export function loadKeys(prefix: string): ProviderKey[] {
  const keys: ProviderKey[] = [];
  let index = 1;

  while (true) {
    const apiKey = process.env[`${prefix}_API_KEY_${index}`];
    if (!apiKey || apiKey.trim() === '') break;

    const voiceId = process.env[`${prefix}_VOICE_ID_${index}`];
    keys.push({ apiKey: apiKey.trim(), voiceId, index });
    index++;
  }

  return keys;
}

/**
 * Pilih key secara random dari array.
 *
 * @param keys - Array of ProviderKey
 * @returns ProviderKey terpilih
 * @throws Error jika keys kosong
 */
export function getRandomKey(keys: ProviderKey[]): ProviderKey {
  if (keys.length === 0) {
    throw new Error('Tidak ada API key yang tersedia');
  }
  const idx = Math.floor(Math.random() * keys.length);
  return keys[idx];
}

/**
 * Coba execute function dengan key rotation.
 *
 * @param keys - Array of ProviderKey
 * @param fn - Function yang menerima apiKey dan voiceId, return Promise<T>
 * @returns Result dari fn
 * @throws Error jika semua key gagal (401/429) atau error non-retryable
 */
export async function executeWithRotation<T>(
  keys: ProviderKey[],
  fn: (apiKey: string, voiceId?: string) => Promise<T>
): Promise<T> {
  if (keys.length === 0) {
    throw new Error('Tidak ada API key yang tersedia');
  }

  // Shuffle keys untuk random order
  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  const errors: string[] = [];

  for (const key of shuffled) {
    try {
      const result = await fn(key.apiKey, key.voiceId);
      return result;
    } catch (error) {
      const status = extractStatus(error);
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Key #${key.index}: ${msg}`);

      // Hanya retry jika error 401 (unauthorized) atau 429 (rate limit)
      // Untuk error lain (500, timeout, dll) langsung throw
      if (status !== 401 && status !== 429) {
        throw error;
      }

      console.warn(`[KeyRotator] Key #${key.index} gagal (${status}), coba key lain...`);
    }
  }

  throw new Error(`Semua API key gagal:\n${errors.join('\n')}`);
}

/**
 * Extract HTTP status code dari error message.
 * Mendukung format: "ElevenLabs API error (401): ..." atau "HTTP 429 ..."
 */
function extractStatus(error: unknown): number | null {
  const msg = error instanceof Error ? error.message : String(error);

  // Format: "error (401)" atau "error (429)"
  const parenMatch = msg.match(/\((\d{3})\)/);
  if (parenMatch) return parseInt(parenMatch[1], 10);

  // Format: "HTTP 401" atau "status 429"
  const httpMatch = msg.match(/\b(?:HTTP|status)\s+(\d{3})\b/i);
  if (httpMatch) return parseInt(httpMatch[1], 10);

  return null;
}