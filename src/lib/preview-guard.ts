import Redis from "ioredis";

/**
 * Enforcer preview premium 1× per device (Fase 2 — gating trial).
 *
 * Cartesia/ElevenLabs berbayar → preview 7 kata suara premium hanya boleh
 * didengar SEKALI per perangkat (identityKey / device_id), supaya orang tidak
 * bisa spam & menguras biaya TTS.
 *
 * Strategy fail-open: jika Redis tidak tersedia / error, kita IZINKAN preview
 * (availability > enforcement), konsisten dengan rate-limit yang ada.
 */

const redisUrl = process.env.REDIS_URL;
let client: Redis | null = null;
let available = false;
if (redisUrl) {
  try {
    client = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 2000 });
    available = true;
  } catch {
    available = false;
  }
}

const PREFIX = "acs-preview-premium:1x:";

/** Cek apakah device sudah memakai preview premium. */
export async function isPreviewUsed(identityKey: string): Promise<boolean> {
  if (!available || !client) return false; // fail-open
  try {
    const v = await client.get(PREFIX + identityKey);
    return v === "1";
  } catch (e) {
    console.warn("[preview-guard] get error (fail-open):", e);
    return false;
  }
}

/** Tandai device telah menggunakan preview premium (1×). */
export async function markPreviewUsed(identityKey: string): Promise<void> {
  if (!available || !client) return;
  try {
    await client.set(PREFIX + identityKey, "1");
  } catch (e) {
    console.warn("[preview-guard] set error (fail-open):", e);
  }
}

export { client, available };