/**
 * Cron Job: /api/cron/trends — HANYA untuk trigger manual dari admin
 * (tombol "Trigger Harvest Manual").
 *
 * Sumber kebenaran harvest = GitHub Actions → scripts/harvest.ts (cron 4×/hari).
 * Route ini memakai modul YANG SAMA (src/lib/trend-harvest.ts) sehingga
 * perilakunya identik: fetch sumber → ekstraksi sequential + jeda Groq →
 * normalisasi keyword → baseline 7 hari → skor/velocity → upsert RPC 024.
 *
 * Risiko: total durasi (jeda Groq + translate US) bisa melebihi limit
 * function Vercel — bila timeout, harvest tetap jalan via GH Actions.
 *
 * Proteksi: header Authorization: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { runTrendHarvest } from "@/lib/trend-harvest";
import { recordAdminMetricsDay } from "@/lib/admin-snapshot";

export async function GET(request: NextRequest) {
  // ===== Proteksi CRON_SECRET =====
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const summary = await runTrendHarvest(supabase);

  try {
    await recordAdminMetricsDay();
  } catch (e) {
    console.warn("[cron-trends] snapshot gagal:", e instanceof Error ? e.message : e);
  }

  const total = summary.inserted;
  const results = summary.byNiche.map((n) => ({
    niche: n.niche,
    count: n.count,
    source: "mixed",
  }));

  return NextResponse.json({
    success: summary.errors.length === 0,
    message: `Cron trends selesai: ${total} data dari ${results.length} niche`,
    total,
    skipped: summary.batchRows - summary.inserted,
    results,
    baselineRows: summary.baselineRows,
    velocity: summary.velocity,
    errors: summary.errors,
  });
}
