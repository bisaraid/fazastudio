import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { computeAdminDeltas, type AdminDeltas } from "@/lib/admin-delta";
import { requireAdmin } from "../_auth";

/**
 * GET /api/admin/stats — Admin dashboard aggregate stats.
 *
 * Auth: AKUN TERDAFTAR (Supabase Auth cookie), bukan shared secret.
 *  - Belum login              → 401
 *  - Login tapi bukan admin   → 403
 *  - Admin (is_admin / ADMIN_EMAILS) → 200 + data
 * Auto-promote: user dengan email di ADMIN_EMAILS tapi belum is_admin
 * akan di-set is_admin=true (bootstrap admin pertama).
 *
 * QUERY DEFENSIVE: tiap agregasi try/catch sendiri — satu tabel gagal
 * tidak merusak seluruh dashboard.
 *
 * `deltas` = pembanding 7 hari terakhir vs 7 hari sebelumnya untuk user/project/
 * script baru. Kalau perhitungannya gagal, field ini null dan UI menampilkan "—"
 * (bukan error halaman).
 */

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Hitung jumlah user terdaftar (non-anonymous) dari auth.users via listUsers. */
async function countAuthUsers(): Promise<number> {
  try {
    const supabase = createServiceRoleClient();
    let page = 1;
    let total = 0;
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw error;
      const users = data?.users ?? [];
      if (users.length === 0) break;
      total += users.filter((u) => !u.is_anonymous).length;
      if (users.length < 1000) break;
      page++;
    }
    return total;
  } catch (e) {
    console.warn("[admin-stats] countAuthUsers gagal:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Auth admin (dedupe) — getSessionUser + isAdminUser/auto-promote centralizzaa di _auth.ts. */

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const supabase = createServiceRoleClient();
  const since7d = isoDaysAgo(7);

  async function count(table: string, opts: { gteCol?: string; gteVal?: string } = {}): Promise<number> {
    try {
      let q = supabase.from(table).select("id", { count: "exact", head: true });
      if (opts.gteCol && opts.gteVal) {
        q = q.gte(opts.gteCol, opts.gteVal);
      }
      const { count: c } = await q;
      return c ?? 0;
    } catch (e) {
      console.warn(`[admin-stats] count ${table} gagal:`, e instanceof Error ? e.message : e);
      return 0;
    }
  }

  // ===== AGREGASI (setari defensive) =====
  const projectsTotal = await count("projects");
  const projects7d = await count("projects", { gteCol: "created_at", gteVal: since7d });
  async function countWhereStatus(table: string, status: string): Promise<number> {
    try {
      const { count: c } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      return c ?? 0;
    } catch (e) {
      console.warn(`[admin-stats] count ${table} status=${status} gagal:`, e instanceof Error ? e.message : e);
      return 0;
    }
  }
  const projectsCompleted = await countWhereStatus("projects", "completed");

  const usageRows = await count("user_usage");

  async function usageByPlan(plan: string): Promise<number> {
    try {
      const { count: c } = await supabase
        .from("user_usage")
        .select("id", { count: "exact", head: true })
        .eq("plan", plan);
      return c ?? 0;
    } catch (e) {
      console.warn(`[admin-stats] usageByPlan(${plan}) gagal:`, e instanceof Error ? e.message : e);
      return 0;
    }
  }
  const [usageFree, usageStarter, usagePro] = await Promise.all([
    usageByPlan("free"),
    usageByPlan("starter"),
    usageByPlan("pro"),
  ]);

  const profilesTotal = await countAuthUsers();
  const trendsTotal = await count("trend_ideas");

  let trendsLastFetched: string | null = null;
  try {
    const { data } = await supabase
      .from("trend_ideas")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    trendsLastFetched = data?.fetched_at ?? null;
  } catch (e) {
    console.warn("[admin-stats] trend lastFetched gagal:", e instanceof Error ? e.message : e);
  }

  const scriptGenTotal = await count("script_generations");
  const scriptGen7d = await count("script_generations", { gteCol: "created_at", gteVal: since7d });

  // Delta% 7d vs 7d sebelumnya — defensif: gagal → null (UI tampil "—").
  let deltas: AdminDeltas | null = null;
  try {
    deltas = await computeAdminDeltas();
  } catch (e) {
    console.warn("[admin-stats] deltas gagal:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    success: true,
    data: {
      projects: { total: projectsTotal, last7d: projects7d, completed: projectsCompleted },
      usage: { rows: usageRows, free: usageFree, starter: usageStarter, pro: usagePro },
      profiles: { total: profilesTotal },
      trends: { total: trendsTotal, lastFetched: trendsLastFetched },
      scriptGenerations: { total: scriptGenTotal, last7d: scriptGen7d },
      deltas,
      generatedAt: new Date().toISOString(),
    },
  });
}