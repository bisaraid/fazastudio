import { NextRequest, NextResponse } from "next/server";
import { hostOf, isValidProxyUrl } from "@/lib/proxy-url";

/**
 * GET /api/video-proxy?url=<encoded-video-url>
 *
 * Server-side video proxy untuk browser PREVIEW. Mendukung HTTP Range
 * + streaming pass-through.
 *
 * FIX: helper validasi dipisah ke lib/proxy-url (Next.js route type-check
 * menolak extra export dari file route).
 */

// Video tersimpan di Cloudflare R2 (primary) — lihat lib/r2.ts.
// Backward-compat juga mendukung Supabase Storage.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

/** Host yang diizinkan dari env (Supabase + R2 public). */
function getAllowedVideoHosts(): string[] {
  return [hostOf(SUPABASE_URL), hostOf(R2_PUBLIC_URL)].filter(
    (h): h is string => !!h
  );
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

  if (!isValidProxyUrl(targetUrl, getAllowedVideoHosts())) {
    return NextResponse.json(
      { success: false, error: "URL tidak valid. Hanya URL storage yang diizinkan." },
      { status: 403 }
    );
  }

  try {
    // Forward Range header dari browser (penting untuk seeking <video>).
    const rangeHeader = request.headers.get("range");
    const headers: Record<string, string> = {};
    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    const upstreamRes = await fetch(targetUrl, { headers });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      console.error(`[video-proxy] Upstream error: ${upstreamRes.status}`);
      return NextResponse.json(
        { success: false, error: `Gagal fetch video (${upstreamRes.status})` },
        { status: upstreamRes.status }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      upstreamRes.headers.get("content-type") || "video/mp4"
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
    console.error("[video-proxy] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}