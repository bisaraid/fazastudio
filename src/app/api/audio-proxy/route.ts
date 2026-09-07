import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/audio-proxy?url=<encoded-audio-url>
 *
 * Server-side audio proxy untuk browser preview. Mendukung HTTP Range
 * (penting untuk seeking <audio>) + streaming pass-through.
 *
 * FIX SESI A (kinerja/memory) — mirror fix video-proxy:
 * - SEBELUMNYA: `await upstreamRes.arrayBuffer()` → seluruh audio di-download
 *   penuh ke memory server pada setiap request (byte range / seek).
 * - SESUDAHNYA: stream `upstreamRes.body` diteruskan LANGSUNG (passthrough)
 *   tanpa buffer.
 *
 * Kontrak API TIDAK berubah (backward compatible):
 * - GET /api/audio-proxy?url=... → 206 bila upstream 206, else 200.
 * - Header diteruskan: Content-Type, Content-Length, Content-Range (206),
 *   Accept-Ranges, Cache-Control, CORS.
 */

// Audio tersimpan di Supabase Storage (audio_url) — primary.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

/** Ambil host dari URL; null jika tidak valid. DIPISAH agar bisa di-test. */
export function hostOf(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

/**
 * Validasi URL target hanya dari daftar host yang diizinkan.
 * Pure function agar dapat di-unit-test tanpa env.
 */
export function isValidAudioUrl(
  targetUrl: string,
  allowedHosts: string[]
): boolean {
  if (!targetUrl || allowedHosts.length === 0) return false;
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return allowedHosts.includes(parsed.host);
  } catch {
    return false;
  }
}

/** Host diizinkan dari env (Supabase storage). */
export function getAllowedAudioHosts(): string[] {
  return [hostOf(SUPABASE_URL)].filter((h): h is string => !!h);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json(
      { success: false, error: "Parameter url wajib diisi" },
      { status: 400 }
    );
  }

  if (!isValidAudioUrl(targetUrl, getAllowedAudioHosts())) {
    return NextResponse.json(
      { success: false, error: "URL tidak valid. Hanya URL storage yang diizinkan." },
      { status: 403 }
    );
  }

  try {
    // Forward Range header dari browser (penting untuk seeking <audio>).
    const rangeHeader = request.headers.get("range");
    const headers: Record<string, string> = {};
    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    const upstreamRes = await fetch(targetUrl, { headers });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      console.error(`[audio-proxy] Upstream error: ${upstreamRes.status}`);
      return NextResponse.json(
        { success: false, error: `Gagal fetch audio (${upstreamRes.status})` },
        { status: upstreamRes.status }
      );
    }

    // Bangun response headers (konsisten dengan versi lama).
    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      upstreamRes.headers.get("content-type") || "audio/mpeg"
    );
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "public, max-age=3600");
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength && upstreamRes.status !== 206) {
      responseHeaders.set("Content-Length", contentLength);
    }

    if (upstreamRes.status === 206) {
      const contentRange = upstreamRes.headers.get("content-range");
      if (contentRange) {
        responseHeaders.set("Content-Range", contentRange);
      }
    }

    // STREAMING passthrough — body upstream diteruskan LANGSUNG tanpa buffer.
    return new Response(upstreamRes.body, {
      status: upstreamRes.status === 206 ? 206 : 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[audio-proxy] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}