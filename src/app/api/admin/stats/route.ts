import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { getAdminEmails } from "@/lib/admin-auth";

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
 */

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Baca user dari sesi cookie; null jika tidak login. */
async function getSessionUser() {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch (e) {
    console.warn("[admin-stats] getSessionUser gagal:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Cek admin dari DB (is_admin) atau bootstrap env ADMIN_EMAILS + auto-promote. */
async function isAdminUser(userId: string, email?: string | null): Promise<boolean> {
  const service = createServiceRoleClient();

  // 1) Cek flag is_admin di DB.
  const { data: profile } = await service
    .from("profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (profile?.is_admin) return true;

  // 2) Bootstrap: email di ADMIN_EMAILS → auto-promote (idempoten).
  const emailLower = (email || "").trim().toLowerCase();
  if (emailLower && getAdminEmails().includes(emailLower)) {
    try {
      await service
        .from("profiles")
        .upsert(
          { user_id: userId, is_admin: true, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
    } catch (e) {
      console.warn("[admin-stats] auto-promote gagal:", e instanceof Error ? e.message : e);
    }
    return true;
  }

  return false;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Silakan masuk terlebih dahulu" }, { status: 401 });
  }

  const admin = await isAdminUser(user.id, user.email);
  if (!admin) {
    return NextResponse.json({ success: false, error: "Akun ini tidak memiliki akses admin" }, { status: 403 });
  }

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

  const profilesTotal = await count("profiles");
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

  return NextResponse.json({
    success: true,
    data: {
      projects: { total: projectsTotal, last7d: projects7d, completed: projectsCompleted },
      usage: { rows: usageRows, free: usageFree, starter: usageStarter, pro: usagePro },
      profiles: { total: profilesTotal },
      trends: { total: trendsTotal, lastFetched: trendsLastFetched },
      scriptGenerations: { total: scriptGenTotal, last7d: scriptGen7d },
      generatedAt: new Date().toISOString(),
    },
  });
}