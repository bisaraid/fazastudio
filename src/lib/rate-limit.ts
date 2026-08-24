/**
 * Rate limiter menggunakan Redis self-hosted (ioredis) — sliding window
 *
 * Diadopsi dari viraloop/src/lib/rate-limit.ts (148 baris).
 *
 * PERUBAHAN DARI VIRALOOP:
 * - Client library: @upstash/redis + @upstash/ratelimit → ioredis
 * - Koneksi: UPSTASH_REDIS_REST_URL/TOKEN → REDIS_URL (redis://localhost:6379)
 * - Algoritma sliding window diimplementasikan manual dengan Redis Sorted Set
 *   (ZADD + ZREMRANGEBYSCORE + ZCARD) — logic rate-limiting TIDAK berubah.
 *
 * ⚠️ Fail-open strategy:
 * Jika koneksi Redis gagal/timeout, error di-log dan request DIIZINKAN lewat.
 * Trade-off: availability > security saat Redis down.
 * Alternatif fail-closed bisa diaktifkan dengan mengganti fallback di catch block.
 *
 * Interface checkRateLimit(key, maxRequests, windowMs) tetap SAMA
 * seperti implementasi asli — tidak ada breaking change di pemanggil.
 */

import Redis from 'ioredis';

// Inisialisasi Redis client dari env vars
const redisUrl = process.env.REDIS_URL;

let redisClient: Redis | null = null;
let redisAvailable = false;

if (redisUrl) {
  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
    });
    redisAvailable = true;
  } catch (err) {
    console.error('⚠️ [RateLimit] Gagal inisialisasi Redis:', err);
  }
} else {
  console.warn('⚠️ [RateLimit] REDIS_URL tidak diset — Redis tidak tersedia');
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Fallback in-memory store jika Redis tidak tersedia
 */
const fallbackStore = new Map<string, { timestamps: number[] }>();

// Cleanup expired fallback entries setiap 60 detik
setInterval(() => {
  const now = Date.now();
  fallbackStore.forEach((entry, key) => {
    entry.timestamps = entry.timestamps.filter((ts: number) => now - ts < 60_000);
    if (entry.timestamps.length === 0) {
      fallbackStore.delete(key);
    }
  });
}, 60_000);

function fallbackCheck(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let entry = fallbackStore.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    fallbackStore.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter(ts => now - ts < windowMs);
  const currentCount = entry.timestamps.length;
  const allowed = currentCount < maxRequests;

  if (allowed) {
    entry.timestamps.push(now);
  }

  const oldestTimestamp = entry.timestamps.length > 0 ? entry.timestamps[0] : now;
  const resetInSeconds = Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));

  return {
    allowed,
    remaining: Math.max(0, maxRequests - currentCount - (allowed ? 1 : 0)),
    resetInSeconds,
  };
}

/**
 * Sliding window rate limit menggunakan Redis Sorted Set.
 *
 * Algoritma:
 * 1. ZADD key <timestamp> <unique-member> — tambah request baru
 * 2. ZREMRANGEBYSCORE key 0 <now - windowMs> — hapus request yang expired
 * 3. ZCARD key — hitung jumlah request dalam window
 * 4. EXPIRE key <windowSec> — set TTL agar key tidak menumpuk
 *
 * Ini adalah implementasi sliding window yang sama dengan @upstash/ratelimit
 * (Ratelimit.slidingWindow) — hanya client library yang berbeda.
 */
async function redisCheck(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult> {
  if (!redisClient) {
    return fallbackCheck(key, maxRequests, windowMs);
  }

  const now = Date.now();
  const redisKey = `acs-ratelimit:${key}`;
  const member = `${now}:${Math.random().toString(36).substring(2, 10)}`;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  // Pipeline untuk atomicity
  const pipeline = redisClient.pipeline();
  pipeline.zadd(redisKey, now, member);
  pipeline.zremrangebyscore(redisKey, 0, now - windowMs);
  pipeline.zcard(redisKey);
  pipeline.expire(redisKey, windowSec);

  const results = await pipeline.exec();

  if (!results) {
    throw new Error('Redis pipeline exec returned null');
  }

  // Hasil pipeline: [zaddResult, zremResult, zcardResult, expireResult]
  const zcardResult = results[2];
  const currentCount = Array.isArray(zcardResult) && zcardResult[0] === null
    ? (zcardResult[1] as number)
    : 0;

  const allowed = currentCount <= maxRequests;

  // Hitung reset time: ambil timestamp tertua yang masih dalam window
  const oldestResult = await redisClient.zrange(redisKey, 0, 0, 'WITHSCORES');
  let resetInSeconds = windowSec;
  if (oldestResult && oldestResult.length >= 2) {
    const oldestTimestamp = Number(oldestResult[1]);
    resetInSeconds = Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));
  }

  return {
    allowed,
    remaining: Math.max(0, maxRequests - currentCount + (allowed ? 1 : 0)),
    resetInSeconds,
  };
}

/**
 * Check rate limit untuk suatu key identifier
 *
 * @param key - Unique identifier (misal: "layer1:127.0.0.1" atau "layer2:127.0.0.1:same-origin")
 * @param maxRequests - Maksimum request dalam sliding window
 * @param windowMs - Window time dalam ms (default: 60_000 = 1 menit)
 *
 * @returns RateLimitResult dengan allowed, remaining, resetInSeconds
 *
 * Catatan: Signature function ini SAMA dengan implementasi asli viraloop.
 * Tidak ada perubahan cara panggil di API routes.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number = 5,
  windowMs: number = 60_000
): Promise<RateLimitResult> {
  // Jika Redis tidak tersedia, gunakan fallback in-memory
  if (!redisAvailable || !redisClient) {
    return fallbackCheck(key, maxRequests, windowMs);
  }

  try {
    return await redisCheck(key, maxRequests, windowMs);
  } catch (error) {
    // Fail-open: jika Redis error, log dan allow request
    console.error(`⚠️ [RateLimit] Redis error untuk key "${key}":`, error);
    return fallbackCheck(key, maxRequests, windowMs);
  }
}

/**
 * Get client IP from request
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}