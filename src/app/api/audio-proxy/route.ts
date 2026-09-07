import { NextRequest, NextResponse } from "next/server";
import { hostOf, isValidProxyUrl } from "@/lib/proxy-url";

/**
 * GET /api/audio-proxy?url=<encoded-audio-url>
 *
 * Server-side audio proxy untuk browser preview. Mendukung HTTP Range
 * + streaming pass-through.
 *
 * FIX: helper validasi dipisah ke lib/proxy-url (Next.js route type-check
 * menolak extra export dari file route — see lib/proxy-url.ts).
 */

// Audio tersimpan di Supabase Storage (audio_url) — primary.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

/** Host diizinkan dari env (Supabase storage). */
function getAllowedAudioHosts(): string[] {
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

  if (!isValidProxyUrl(targetUrl, getAllowedAudioHosts())) {
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