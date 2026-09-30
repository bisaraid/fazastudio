import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireAdmin } from "../_auth";

/** Detect PostgREST "function not found" (PGRST202) → migration 029 belum jalan. */
function isFnMissing(error: { code?: string; message?: string } | null): boolean {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return code === "PGRST202" || message.includes("Could not find the function");
}

/**
 * GET /api/admin/trends — data monitor tren untuk halaman admin/trending:
 * statistik total + 10 topik terbaru.
 *
 * byNiche memakai RPC admin_trend_niche_counts (migration 029 — agregat di
 * database, tanpa full-scan). Bila fungsi belum ada (PGRST202), fallback ke
 * scan lama agar halaman tetap jalan. Baris `ai_fallback` (sumber non-harvest)
 * tidak dihitung di ketiga angka — konsisten dengan RPC.
 */
export async function GET() {
  const { response: unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const supabase = createServiceRoleClient();

  try {
    // ai_fallback = cache /api/ideas, bukan harvest → monitoring mengecualikannya.
    const { count: total, error: countErr } = await supabase
      .from("trend_ideas")
      .select("id", { count: "exact", head: true })
      .neq("source", "ai_fallback");
    if (countErr) throw countErr;

    let lastFetched: string | null = null;
    try {
      const { data } = await supabase
        .from("trend_ideas")
        .select("fetched_at")
        .neq("source", "ai_fallback")
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
      .neq("source", "ai_fallback")
      .order("fetched_at", { ascending: false })
      .limit(10);
    if (latestErr) throw latestErr;

    // ===== byNiche: RPC dulu, fallback scan lama =====
    let byNiche: Array<{ niche: string; count: number }> = [];
    let viaRpc = true;
    const { data: rpcRows, error: rpcErr } = await supabase.rpc("admin_trend_niche_counts");
    if (rpcErr && !isFnMissing(rpcErr)) {
      // Error lain (bukan "belum migrate") → tetap coba fallback, laporkan.
      console.warn(
        "[admin-trends] rpc admin_trend_niche_counts error, pakai fallback:",
        rpcErr.code,
        rpcErr.message
      );
    }
    if (!rpcErr && Array.isArray(rpcRows)) {
      byNiche = (rpcRows as Array<{ niche_slug: string; total: number | string }>).map((r) => ({
        niche: r.niche_slug,
        count: Number(r.total),
      }));
    } else {
      viaRpc = false;
      if (rpcErr && isFnMissing(rpcErr)) {
        console.warn(
          "[admin-trends] RPC admin_trend_niche_counts belum ada (jalankan migration 029) — fallback scan"
        );
      }
      // Fallback: scan penuh (perilaku lama) — tetap kecualikan ai_fallback.
      const { data: nicheRows, error: nicheErr } = await supabase
        .from("trend_ideas")
        .select("niche_slug, source");
      if (nicheErr) throw nicheErr;
      const byNicheMap = new Map<string, number>();
      for (const r of nicheRows ?? []) {
        if (r.source === "ai_fallback") continue;
        const n = typeof r.niche_slug === "string" ? r.niche_slug : "unknown";
        byNicheMap.set(n, (byNicheMap.get(n) ?? 0) + 1);
      }
      byNiche = Array.from(byNicheMap.entries())
        .map(([niche, count]) => ({ niche, count }))
        .sort((a, b) => b.count - a.count);
    }

    return NextResponse.json({
      success: true,
      data: {
        total: total ?? 0,
        lastFetched,
        byNiche,
        byNicheVia: viaRpc ? "rpc" : "fallback_scan",
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