import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/audio-proxy?url=<encoded-supabase-url>
 *
 * Server-side audio proxy untuk browser preview.
 * Browser <audio> gagal memutar Supabase URL langsung karena COEP/CORS.
 * Proxy ini fetch dari Supabase dan meneruskan dengan header yang benar.
 *
 * Mendukung HTTP Range request:
 * - Meneruskan header `Range` dari browser ke Supabase
 * - Return 206 jika upstream 206
 * - Meneruskan Content-Range, Accept-Ranges, Content-Length
 *
 * Validasi URL: hanya izinkan URL dari Supabase storage domain.
 * Jangan log API key atau isi audio.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

/** Validasi URL hanya dari Supabase storage domain */
function isValidSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!SUPABASE_URL) return false;

    const supabaseHost = new URL(SUPABASE_URL).host;
    return parsed.host === supabaseHost;
  } catch {
    return false;
  }
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

  // Validasi URL — cegah open proxy ke arbitrary host
  if (!isValidSupabaseUrl(targetUrl)) {
    return NextResponse.json(
      { success: false, error: "URL tidak valid. Hanya URL Supabase storage yang diizinkan." },
      { status: 403 }
    );
  }

  try {
    // Teruskan Range header dari browser (jika ada)
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

    const arrayBuffer = await upstreamRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Bangun response headers
    const responseHeaders: Record<string, string> = {
      "Content-Type": upstreamRes.headers.get("content-type") || "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    };

    // Content-Length dari upstream (jika tersedia)
    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    } else {
      responseHeaders["Content-Length"] = buffer.length.toString();
    }

    // Content-Range jika upstream 206 (partial content)
    if (upstreamRes.status === 206) {
      const contentRange = upstreamRes.headers.get("content-range");
      if (contentRange) {
        responseHeaders["Content-Range"] = contentRange;
      }
    }

    return new NextResponse(buffer, {
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