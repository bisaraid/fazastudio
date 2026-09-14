/**
 * Queue definition — Faza Studio Video Render Worker
 *
 * Sumber kebenaran untuk nama queue, tipe job data, dan koneksi Redis.
 * Dipakai oleh:
 *   - Vercel  : addRenderJob()  → enqueue dari /api/generate-video
 *   - Worker  : getRenderQueue() + Worker di index.ts
 *
 * Pastikan REDIS_URL sama di kedua sisi.
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";

// ============================================================
// Env
// ============================================================
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("[queue] REDIS_URL wajib di-set di environment");
}

// ============================================================
// Konstanta queue / channel
// ============================================================
export const VIDEO_RENDER_QUEUE = "video-render";

/** Channel Redis pub/sub untuk progress — subscriber progress:{projectId} */
export const progressChannel = (projectId: string) => `progress:${projectId}`;

// ============================================================
// Tipe job data — payload yang dikirim Vercel → worker
// ============================================================
export interface SubtitleSegment {
  id?: string;
  startTime?: number;
  endTime?: number;
  start?: number;
  end?: number;
  text?: string;
}

export interface SubtitleStyle {
  fontSize?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  backgroundAlpha?: number;
  position?: "top" | "bottom";
  fontFamily?: string;
}

export interface SceneFootage {
  sceneId?: string;
  videoUrl: string;
  duration?: number;
}

export interface Scene {
  id?: string;
  heading?: string;
  content?: string;
  imagePrompt?: string;
  visualPrompt?: string;
  image_prompt?: string;
  duration?: number;
  narration?: string;
}

export interface RenderJobData {
  // Input media
  audioUrl: string;
  subtitleUrl: string;
  // Segment subtitle = source of truth untuk build SRT
  subtitleSegments?: SubtitleSegment[];
  subtitleStyle?: SubtitleStyle;

  // Project & identity
  projectId: string;
  identityKey: string; // anon:<device> atau user id
  userId?: string | null;

  // Visual
  genre?: string;
  backgroundUrl?: string;
  sceneFootage?: SceneFootage[];
  scenes?: Scene[];
  platform?: "tiktok" | "youtube" | "reels" | "podcast" | "shopee" | string;

  // Auth context (sudah di-validate Vercel sebelum enqueue)
  // — worker tidak perlu re-validate API key / origin
}

// ============================================================
// Koneksi Redis — lazyConnect + maxRetriesPerRequest: null (BullMQ wajib)
// ============================================================
let _connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("[queue] REDIS_URL wajib di-set di environment");
  }
  if (!_connection) {
    _connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // wajib untuk BullMQ blocking commands
      lazyConnect: true,
      connectTimeout: 10_000,
      enableReadyCheck: true,
    });
  }
  return _connection;
}

// ============================================================
// Queue instance (lazy)
// ============================================================
let _queue: Queue<RenderJobData> | null = null;

export function getRenderQueue(): Queue<RenderJobData> {
  if (!_queue) {
    _queue = new Queue<RenderJobData>(VIDEO_RENDER_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2, // retry sekali jika gagal
        backoff: {
          type: "exponential",
          delay: 5_000,
        },
        removeOnComplete: {
          age: 24 * 3600, // simpan 24 jam
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // simpan 7 hari untuk debug
        },
      },
    });
  }
  return _queue;
}

// ============================================================
// Helper: enqueue job — dipanggil Vercel
// ============================================================
export async function addRenderJob(jobData: RenderJobData): Promise<string> {
  const queue = getRenderQueue();
  const job = await queue.add("render", jobData, {
    jobId: `render:${jobData.projectId}:${Date.now()}`, // idempoten-friendly
  });
  return job.id as string;
}

// ============================================================
// Helper: publish progress ke Redis pub/sub
// ============================================================
export async function publishProgress(
  projectId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const conn = getRedisConnection();
  await conn.publish(progressChannel(projectId), JSON.stringify(payload));
}

/** Tutup koneksi (untuk graceful shutdown) */
export async function closeQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}
