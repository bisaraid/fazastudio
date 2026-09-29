import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireAdmin } from "../_auth";
import { FREE_CREDITS } from "@/lib/usage";

/** Periode bulan aktuell: YYYY-MM */
function currentPeriod(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

interface UsageLike {
  user_id: string | null;
  plan: string;
  credits_total: number;
  credits_used: number;
}

/**
 * GET /api/admin/users — Daftar user (terbaru → lama), max 100.
 * Email diambil dari auth.users (listUsers via service role) karena tabel
 * profiles tidak menyimpan email.
 */
export async function GET(request: NextRequest) {
  const { response: unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(params.get("perPage") ?? "20", 10) || 20)
  );
  const q = (params.get("q") ?? "").trim().toLowerCase();

  const supabase = createServiceRoleClient();
  const period = currentPeriod();

  try {
    const { data: pageData, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw error;
    const authUsers = pageData?.users ?? [];

    const { data: usageRows, error: usageErr } = await supabase
      .from("user_usage")
      .select("user_id, plan, credits_total, credits_used")
      .eq("period", period)
      .not("user_id", "is", null);
    if (usageErr) throw usageErr;

    const usageByUser = new Map<string, UsageLike>();
    for (const row of usageRows ?? ([] as UsageLike[])) {
      if (row.user_id) usageByUser.set(row.user_id, row);
    }

    // Flag is_admin dari tabel profiles.
    const adminByUser = new Map<string, boolean>();
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("user_id, is_admin");
    for (const p of profileRows ?? []) {
      adminByUser.set(p.user_id, Boolean(p.is_admin));
    }

    let list = authUsers.filter((u) => !u.is_anonymous && u.email);
    if (q) list = list.filter((u) => (u.email ?? "").toLowerCase().includes(q));
    list.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const total = list.length;

    const data = list
      .slice((page - 1) * perPage, page * perPage)
      .map((u) => {
        const usage = usageByUser.get(u.id);
        const creditsTotal = usage?.credits_total ?? FREE_CREDITS;
        const creditsUsed = usage?.credits_used ?? 0;
        return {
          userId: u.id,
          email: u.email ?? "",
          plan: (usage?.plan as "free" | "starter" | "pro") || "free",
          creditsTotal,
          creditsUsed,
          creditsRemaining: Math.max(0, creditsTotal - creditsUsed),
          createdAt: u.created_at,
          isAdmin: adminByUser.get(u.id) ?? false,
        };
      });

    return NextResponse.json({
      success: true,
      data,
      total,
      page,
      perPage,
    });
  } catch (e) {
    console.warn("[admin-users] gagal:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { success: false, error: "Gagal mengambil daftar user" },
      { status: 500 }
    );
  }
}