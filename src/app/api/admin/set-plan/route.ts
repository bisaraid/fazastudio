import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { setPlanForUser, type PlanTier } from "@/lib/usage";
import { requireAdmin } from "../_auth";
import { recordAudit } from "@/lib/admin-audit";

const VALID_PLANS: PlanTier[] = ["free", "starter", "pro"];

/** Cari userId dari email via auth.admin.listUsers (service role). */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) return null;
  const target = (data?.users ?? []).find(
    (u) => (u.email ?? "").trim().toLowerCase() === email.trim().toLowerCase()
  );
  return target?.id ?? null;
}

/**
 * POST /api/admin/set-plan
 * Body: { userId?: string, email?: string, plan: "free"|"starter"|"pro" }
 * Menerima userId ATAU email (untuk aktivasi manual via email di halaman Transaksi).
 */
export async function POST(request: NextRequest) {
  const { user, response: unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Body tidak valid" },
      { status: 400 }
    );
  }

  const plan = body.plan as PlanTier;
  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json(
      { success: false, error: "Plan tidak valid" },
      { status: 400 }
    );
  }

  let userId = typeof body.userId === "string" ? body.userId : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!userId && email) {
    userId = (await findUserIdByEmail(email)) ?? "";
  }

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "User tidak ditemukan. Periksa userId/email." },
      { status: 404 }
    );
  }

  const ok = await setPlanForUser(userId, plan);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: "Gagal memperbarui plan" },
      { status: 500 }
    );
  }

  if (user?.id) {
    await recordAudit({
      actorUserId: user.id,
      action: "set_plan",
      subjectUserId: userId,
      subjectEmail: email || undefined,
      payload: { plan },
    });
  }

  return NextResponse.json({ success: true, plan });
}