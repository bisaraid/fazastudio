/**
 * GET /api/trending-ideas?category=horror
 *
 * Mengambil trending suggestions dari tabel trending_suggestions (di-cache).
 * Data ini digenerate oleh job generate-trending-suggestions (1x/hari jam 05:00 UTC)
 * di project viraloop — endpoint ini MURNI read-only, tidak trigger crawler apa pun.
 *
 * Response: { success: true, ideas: string[] }
 * Jika tidak ada data/error: { success: true, ideas: [] } — BUKAN error,
 * tidak menginject data palsu.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTrendingSuggestions } from "@/lib/trending";
import { validateApiKey } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  const category = request.nextUrl.searchParams.get("category") || "";

  try {
    const { ideas, source } = await getTrendingSuggestions(category || undefined);

    // Set revalidate hanya jika data tidak kosong
    const headers: Record<string, string> = {
      "x-data-source": source,
    };
    if (source === "db") {
      headers["cache-control"] = "s-maxage=3600, stale-while-revalidate";
    } else {
      headers["cache-control"] = "no-store";
    }

    return NextResponse.json(
      { success: true, ideas },
      { headers }
    );
  } catch (error) {
    console.error("[TrendingIdeas] Error:", error);
    // Return empty array instead of error — graceful degradation
    return NextResponse.json(
      { success: true, ideas: [] },
      { headers: { "x-data-source": "empty", "cache-control": "no-store" } }
    );
  }
}