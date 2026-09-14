/**
 * Video Render Worker — Faza Studio
 * Listen queue "video-render" via BullMQ, proses 1 job pada satu waktu.
 *
 * Progress di-publish ke Redis pub/sub channel progress:{projectId}
 * agar Vercel (SSE proxy) bisa forward ke client.
 */

import "dotenv/config";
import { Worker, Job } from "bullmq";
import IORedis from "ioredis";

import {
  VIDEO_RENDER_QUEUE,
  getRedisConnection,
  publishProgress,
  progressChannel,
  closeQueue,
  RenderJobData,
} from "./queue";
import { renderVideo } from "./render";
import { getServiceRoleClient } from "./lib/supabase";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("[worker] REDIS_URL wajib di-set di environment");
}

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 1);
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

console.log(`[worker] Starting — queue="${VIDEO_RENDER_QUEUE}", concurrency=${CONCURRENCY}`);
console.log(`[worker] Redis: ${REDIS_URL.replace(/:[^:@]*@/, ":***@")}`);

// ============================================================
// Worker
// ============================================================
const worker = new Worker<RenderJobData>(
  VIDEO_RENDER_QUEUE,
  async (job: Job<RenderJobData>) => {
    const { projectId, identityKey } = job.data;
    const channel = progressChannel(projectId);
    const startTime = Date.now();

    console.log(`[worker] Job ${job.id} mulai — project=${projectId}`);

    // Notify: processing
    await publishProgress(projectId, { status: "processing", jobId: job.id });

    try {
      const onProgress = async (percent: number) => {
        // 1. Update BullMQ job progress (bisa di-poll via API)
        await job.updateProgress(percent);
        // 2. Publish ke Redis pub/sub (untuk SSE proxy di Vercel)
        await publishProgress(projectId, { percent });
      };

      const result = await renderVideo(job.data, onProgress);

      // Update projects table → done
      const supabase = getServiceRoleClient();
      await supabase
        .from("projects")
        .update({
          video_url: result.videoUrl,
          video_storage_plan: result.storagePlan,
          video_expires_at: result.expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId);

      // Notify: done
      await publishProgress(projectId, {
        status: "done",
        videoUrl: result.videoUrl,
        format: result.format,
        resolution: result.resolution,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[worker] Job ${job.id} selesai dalam ${elapsed}s — ${result.videoUrl}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[worker] Job ${job.id} gagal:`, message);

      // Update projects table → error
      try {
        const supabase = getServiceRoleClient();
        await supabase
          .from("projects")
          .update({
            // Kolom status/error — sesuaikan dengan schema projects
            // Jika belum ada kolom, tambahkan via migration
            updated_at: new Date().toISOString(),
          })
          .eq("id", projectId);
      } catch (dbErr) {
        console.error("[worker] Gagal update error ke DB:", dbErr);
      }

      // Notify: error
      await publishProgress(projectId, { status: "error", message });

      throw error; // biar BullMQ handle retry
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: CONCURRENCY,
    // FFmpeg CPU berat — jangan proses bersamaan
    limiter: {
      max: 1,
      duration: 1000,
    },
  }
);

// ============================================================
// Event handlers
// ============================================================
worker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[worker] Error:", err);
});

// ============================================================
// Graceful shutdown
// ============================================================
async function shutdown(signal: string) {
  console.log(`[worker] ${signal} diterima — shutting down...`);
  await worker.close();
  await closeQueue();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log("[worker] Siap menerima job.");
