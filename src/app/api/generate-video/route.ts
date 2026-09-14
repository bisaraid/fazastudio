/**
 * POST /api/generate-video
 *
 * Sekarang: enqueue job ke worker via BullMQ, return jobId.
 * Worker terpisah (Railway) yang melakukan render FFmpeg.
 * Progress tersedia via GET /api/video-progress?projectId=xxx (SSE).
 *
 * Body: { audioUrl, subtitleUrl, projectId, genre?, backgroundUrl?,
 *         subtitleSegments?, subtitleStyle?, platform?,
 *         sceneFootage?, scenes? }
 *
 * Response: { success: true, jobId: string, projectId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { getServerIdentity, buildDeviceCookieHeader } from "@/lib/identity";
import { checkRateLimit, buildBurstKey, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT_LIMITS, DAILY_WINDOW_MS } from "@/lib/rate-limit-config";
import { checkCredits, checkCreditsForUser } from "@/lib/usage";
import { requireProjectOwnership } from "@/lib/project-ownership";

import { addRenderJob } from "../../../../worker/src/queue";
import { validatePublicUrl } from "../../../../worker/src/lib/public-url";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json(
      { success: false, error: auth.error || "Unauthorized" },
      { status: 401 }
    );
  }

  const identity = getServerIdentity(request);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Body JSON tidak valid" },
      { status: 400 }
    );
  }

  const {
    audioUrl,
    subtitleUrl,
    projectId,
    genre,
    backgroundUrl,
    subtitleSegments,
    subtitleStyle,
    platform,
    sceneFootage,
    scenes,
  } = body;

  if (!audioUrl || !subtitleUrl || !projectId) {
    return NextResponse.json(
      { success: false, error: "Field audioUrl, subtitleUrl, dan projectId wajib diisi" },
      { status: 400 }
    );
  }

  // ===== GUARD SSRF (lapis 1): validasi URL media sebelum enqueue =====
  // Path storage bucket (audio/subtitle) diizinkan langsung — di-resolve &
  // divalidasi worker setelah menjadi signed URL https. Nilai lain wajib
  // lolos validatePublicUrl (https-only, bukan data URI / IP private).
  const isStoragePathValue = (v: string) =>
    !v.startsWith("http://") && !v.startsWith("https://") && !v.startsWith("data:");
  const mediaInputs: string[] = [];
  for (const v of [audioUrl, subtitleUrl, backgroundUrl]) {
    if (typeof v === "string" && v.length > 0) mediaInputs.push(v);
  }
  if (Array.isArray(sceneFootage)) {
    for (const sf of sceneFootage) {
      if (sf && typeof sf.videoUrl === "string") mediaInputs.push(sf.videoUrl);
    }
  }
  try {
    for (const v of mediaInputs) {
      if (isStoragePathValue(v)) continue; // bucket path — diverifikasi di worker
      validatePublicUrl(v);
    }
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: "URL media tidak valid: " + (err instanceof Error ? err.message : "ditolak pertahanan SSRF"),
      },
      { status: 400 }
    );
  }

  // ===== CREDIT CHECK =====
  const videoSession = createSupabaseServerClient();
  const {
    data: { user: videoUser },
  } = await videoSession.auth.getUser();
  const hasCredit = videoUser
    ? await checkCreditsForUser(videoUser.id)
    : await checkCredits(identity.identityKey);
  if (!hasCredit) {
    return NextResponse.json(
      { success: false, error: "Kredit kamu habis! Upgrade untuk melanjutkan." },
      { status: 402 }
    );
  }

  // ===== OWNERSHIP GUARD (IDOR) =====
  const ownedProject = await requireProjectOwnership({
    projectId,
    identityKey: identity.identityKey,
    userId: videoUser?.id ?? null,
  });
  if (!ownedProject) {
    return NextResponse.json(
      { success: false, error: "Project tidak ditemukan atau tidak punya akses" },
      { status: 404 }
    );
  }

  // ===== RATE-LIMIT VIDEO (5 render/hari) =====
  const ip = getClientIp(request);
  const rlScopeKey = videoUser?.id ? `u:${videoUser.id}` : identity.identityKey;
  const videoRl = await checkRateLimit(
    buildBurstKey(rlScopeKey, ip, "video"),
    RATE_LIMIT_LIMITS.videoPerDay,
    DAILY_WINDOW_MS
  );
  if (!videoRl.allowed) {
    return NextResponse.json(
      { success: false, error: "Kamu sudah mencapai batas harian render video (5). Coba lagi besok." },
      { status: 429 }
    );
  }

  // ===== ENQUEUE JOB KE WORKER =====
  let jobId: string;
  try {
    jobId = await addRenderJob({
      audioUrl,
      subtitleUrl,
      subtitleSegments,
      subtitleStyle,
      projectId,
      identityKey: identity.identityKey,
      userId: videoUser?.id ?? null,
      genre,
      backgroundUrl,
      sceneFootage,
      scenes,
      platform,
    });
  } catch (err) {
    console.error("[generate-video] Gagal enqueue job:", err);
    return NextResponse.json(
      { success: false, error: "Gagal membuat job render. Coba lagi." },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ success: true, jobId, projectId });
  if (identity.isNew) {
    response.headers.append("Set-Cookie", buildDeviceCookieHeader(identity.deviceId));
  }

  console.log(`[generate-video] Job enqueued: ${jobId} project=${projectId}`);
  return response;
}
