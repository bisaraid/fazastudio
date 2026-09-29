import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireAdmin } from "../_auth";

/**
 * GET /api/admin/metrics?days=30 — Riwayat harian metrik admin (untuk chart).
 *
 * Sumber: tabel admin_metrics_daily (migration 026).
 * DEFENSIF: kalau tabel belum dibuat (migration belum dijalankan), endpoint ini
 * tetap 200 dengan rows kosong + tableReady=false, supaya UI menampilkan
 * empty state, bukan halaman error.
 *
 * isEstimated=true menandai baris hasil backfill (nilai perkiraan).
 */

interface MetricsDailyRow {
  date: string;
  total_users: number | null;
  total_projects: number | null;
  total_scripts: number | null;
  total_trends: number | null;
  paid_users: number | null;
  is_estimated: boolean | null;
}

export async function GET(request: NextRequest) {
  const { response: unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const params = request.nextUrl.searchParams;
  const days = Math.min(90, Math.max(7, parseInt(params.get("days") ?? "30", 10) || 30));

  const today = new Date();
  const from = new Date(today.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);

  let rows: MetricsDailyRow[] = [];
  let tableReady = true;

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("admin_metrics_daily")
      .select("date,total_users,total_projects,total_scripts,total_trends,paid_users,is_estimated")
      .gte("date", from)
      .order("date", { ascending: true })
      .limit(120);

    if (error) {
      tableReady = false;
      console.warn("[admin-metrics] query gagal:", error.message);
    } else {
      rows = (data ?? []) as MetricsDailyRow[];
    }
  } catch (e) {
    tableReady = false;
    console.warn("[admin-metrics] exception:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    success: true,
    data: {
      days,
      from,
      tableReady,
      rows: rows.map((r) => ({
        date: r.date,
        totalUsers: r.total_users ?? 0,
        totalProjects: r.total_projects ?? 0,
        totalScripts: r.total_scripts ?? 0,
        totalTrends: r.total_trends ?? 0,
        paidUsers: r.paid_users ?? 0,
        isEstimated: Boolean(r.is_estimated),
      })),
      generatedAt: new Date().toISOString(),
    },
  });
}
