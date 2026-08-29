import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { FootageOption } from "@/lib/types";
import { searchFootage, resolveSearchQuery } from "@/lib/footage";

/**
 * POST /api/footage/batch
 *
 * Ambil opsi footage untuk BANYAK scene sekaligus dari backend (Pexels).
 * Frontend cukup satu panggilan untuk semua scene — user tinggal memilih
 * thumbnail per scene tanpa menunggu fetch satu-per-satu.
 *
 * Body: { scenes: [{ sceneId, query?, genre? }], perPage? }
 * Response: { success: true, data: Record<sceneId, FootageOption[]> }
 */
export async function POST(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const scenes = Array.isArray(body.scenes) ? body.scenes : [];
    const perPage = body.perPage;

    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "PEXELS_API_KEY tidak tersedia di .env" },
        { status: 500 }
      );
    }

    if (scenes.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    const limit = Math.min(Math.max(perPage || 4, 1), 8);

    const result: Record<string, FootageOption[]> = {};
    for (const scene of scenes) {
      const id = scene?.sceneId || scene?.id;
      if (!id || typeof id !== "string") continue;

      const searchQuery = resolveSearchQuery(scene?.query, scene?.genre);

      try {
        result[id] = await searchFootage(apiKey, searchQuery, limit);
      } catch (e) {
        // Scene yang gagal → kosong, lanjut scene lain (jangan gagalkan batch seluruhnya).
        console.warn(`[footage] batch scene ${id} gagal:`, e);
        result[id] = [];
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[footage] Batch error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}