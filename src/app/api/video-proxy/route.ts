import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/video-proxy?url=<encoded-supabase-url>
 *
 * Server-side video proxy untuk browser PREVIEW, pola sama seperti audio-proxy.
 * Browser <video> terkadang gagal memutar URL Supabase Storage langsung
 * karena COEP / CORS / range header yang tidak pas.
 *
 * Mendukung HTTP Range request (penting untuk seeking <video>):
 * - Meneruskan header `Range` dari browser ke Supabase
 * - Return 206 jika upstream 206
 * - Meneruskan Content-Range, Accept-Ranges, Content-Length
 *
 * Validasi URL: hanya izinkan URL dari Supabase storage domain.
 * Jangan log API key atau isi video.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

// Video kini disimpan di Cloudflare R2 (bukan Supabase Storage) — lihat lib/r2.ts.
// Proxy preview harus meneruskan stream R2 juga, dengan Range support, agar
// <video> bisa memuat dan durasi muncul. Whitelist dua domain: Supabase + R2.
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

/** Ambil host dari URL, return null jika tidak valid */
function hostOf(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

/** Validasi URL hanya dari domain yang diizinkan (Supabase storage + Cloudflare R2 public) */
function isValidSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowedHosts = [hostOf(SUPABASE_URL), hostOf(R2_PUBLIC_URL)].filter(
      (h): h is string => !!h
    );
    if (allowedHosts.length === 0) return false;
    return allowedHosts.includes(parsed.host);
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
    // Teruskan Range header dari browser (jika ada) — penting untuk seeking video
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

    const arrayBuffer = await upstreamRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Bangun response headers
    const responseHeaders: Record<string, string> = {
      "Content-Type": upstreamRes.headers.get("content-type") || "video/mp4",
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
    console.error("[video-proxy] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}