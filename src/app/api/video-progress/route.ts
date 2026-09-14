/**
 * GET /api/video-progress?projectId=xxx
 *
 * SSE proxy: subscribe ke Redis pub/sub channel progress:{projectId}
 * dan forward event dari worker ke client.
 *
 * Worker publish progress via Redis publish ke channel "progress:{projectId}".
 * Endpoint ini dipanggil client setelah mendapat jobId dari /api/generate-video.
 *
 * Event SSE yang diforward:
 *   { percent: 0..100 }
 *   { status: "processing", jobId }
 *   { status: "uploading" }
 *   { status: "done", videoUrl, format, resolution }
 *   { status: "error", message }
 */

import { NextRequest } from "next/server";
import IORedis from "ioredis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDIS_URL = process.env.REDIS_URL;

// Singleton subscriber per cold start — cukup untuk satu connection SSE
let _subscriber: IORedis | null = null;

function getSubscriber(): IORedis {
  if (!_subscriber) {
    if (!REDIS_URL) throw new Error("REDIS_URL tidak diset");
    _subscriber = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      connectTimeout: 10_000,
    });
  }
  return _subscriber;
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return new Response("projectId wajib diisi", { status: 400 });
  }

  if (!REDIS_URL) {
    return new Response("REDIS_URL tidak dikonfigurasi", { status: 500 });
  }

  const channel = `progress:${projectId}`;
  const encoder = new TextEncoder();

  let subscriber: IORedis | null = null;
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          isClosed = true;
        }
      };

      try {
        subscriber = getSubscriber();
        await subscriber.connect();

        // Subscribe ke channel project ini
        await subscriber.subscribe(channel);
        console.log(`[video-progress] Subscribed ${channel}`);

        // Heartbeat agar koneksi tidak diputus proxy
        const heartbeat = setInterval(() => {
          if (isClosed) {
            clearInterval(heartbeat);
            return;
          }
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15_000);

        // Forward message dari Redis ke SSE
        subscriber.on("message", (ch, message) => {
          if (ch !== channel) return;
          try {
            const parsed = JSON.parse(message);
            send(parsed);

            // Jika done/error, tutup setelah kirim
            if (parsed.status === "done" || parsed.status === "error") {
              isClosed = true;
              clearInterval(heartbeat);
              setTimeout(async () => {
                try {
                  await subscriber?.unsubscribe(channel);
                } catch {
                  // ignore
                }
                controller.close();
              }, 100);
            }
          } catch {
            // ignore parse error
          }
        });

        // Client disconnect
        request.signal.addEventListener("abort", async () => {
          isClosed = true;
          clearInterval(heartbeat);
          try {
            await subscriber?.unsubscribe(channel);
          } catch {
            // ignore
          }
          try {
            controller.close();
          } catch {
            // ignore
          }
        });
      } catch (err) {
        console.error("[video-progress] Error:", err);
        send({ status: "error", message: "Gagal terhubung ke progress stream" });
        controller.close();
      }
    },
    async cancel() {
      isClosed = true;
      // Tidak quit subscriber global — reusable untuk request lain
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
