import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { getServerIdentity } from "@/lib/identity";
import { checkRateLimit, buildBurstKey, getClientIp } from "@/lib/rate-limit";
import { RATE_LIMIT_LIMITS, MINUTE_WINDOW_MS } from "@/lib/rate-limit-config";
import { searchFootage, resolveSearchQuery } from "@/lib/footage";

/**
 * POST /api/footage
 *
 * Mencari opsi footage (video stok) berdasarkan query visual yang relevan
 * dengan scene/project. Mengembalikan beberapa pilihan agar user bisa memilih.
 *
 * Body: { query, genre?, perPage? }
 * Response: { success, data: FootageOption[] }
 */
export async function POST(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  // ===== RATE-LIMIT (20 zoekopdrachten Pexels/minuut per identity+IP) =====
  {
    const identity = getServerIdentity(request);
    const ip = getClientIp(request);
    const rl = await checkRateLimit(
      buildBurstKey(identity.identityKey, ip, "footage"),
      RATE_LIMIT_LIMITS.footagePerMinute,
      MINUTE_WINDOW_MS
    );
    if (!rl.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Terlalu banyak request footage. Coba lagi dalam enkele detik.",
          code: "FOOTAGE_RATE_LIMIT",
        },
        {
          status: 429,
          headers: {
            "Retry-After": rl.resetInSeconds.toString(),
            "X-RateLimit-Remaining": rl.remaining.toString(),
          },
        }
      );
    }
  }

  try {
    const body = await request.json();
    const { query, genre, perPage } = body;

    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "PEXELS_API_KEY tidak tersedia di .env" },
        { status: 500 }
      );
    }

    const searchQuery = resolveSearchQuery(query, genre);
    const limit = Math.min(Math.max(perPage || 6, 1), 12);

    const footage = await searchFootage(apiKey, searchQuery, limit);

    return NextResponse.json({ success: true, data: footage });
  } catch (error) {
    console.error("[footage] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}