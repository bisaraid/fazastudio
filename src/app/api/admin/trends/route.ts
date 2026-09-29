import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireAdmin } from "../_auth";

/**
 * GET /api/admin/trends — data monitor tren untuk halaman admin/trending:
 * statistik total + 20 topik terbaru.
 */
export async function GET() {
  const { response: unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const supabase = createServiceRoleClient();

  try {
    const { count: total, error: countErr } = await supabase
      .from("trend_ideas")
      .select("id", { count: "exact", head: true });
    if (countErr) throw countErr;

    let lastFetched: string | null = null;
    try {
      const { data } = await supabase
        .from("trend_ideas")
        .select("fetched_at")
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastFetched = data?.fetched_at ?? null;
    } catch {
      lastFetched = null;
    }

    const { data: latest, error: latestErr } = await supabase
      .from("trend_ideas")
      .select("id, keyword, niche_slug, score, fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(20);
    if (latestErr) throw latestErr;

    return NextResponse.json({
      success: true,
      data: {
        total: total ?? 0,
        lastFetched,
        latest: latest ?? [],
      },
    });
  } catch (e) {
    console.warn("[admin-trends] gagal:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { success: false, error: "Gagal mengambil data tren" },
      { status: 500 }
    );
  }
}