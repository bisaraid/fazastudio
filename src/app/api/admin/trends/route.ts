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
      .select("id, keyword, niche_slug")
      .order("fetched_at", { ascending: false })
      .limit(10);
    if (latestErr) throw latestErr;

    // Agregat per niche (ambi semua niche_slug e hitungi).
    const { data: nicheRows, error: nicheErr } = await supabase
      .from("trend_ideas")
      .select("niche_slug");
    if (nicheErr) throw nicheErr;

    const byNicheMap = new Map<string, number>();
    for (const r of nicheRows ?? []) {
      const n = typeof r.niche_slug === "string" ? r.niche_slug : "unknown";
      byNicheMap.set(n, (byNicheMap.get(n) ?? 0) + 1);
    }
    const byNiche = Array.from(byNicheMap.entries())
      .map(([niche, count]) => ({ niche, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      data: {
        total: total ?? 0,
        lastFetched,
        byNiche,
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