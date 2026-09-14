/**
 * Usage / plan lookup — worker
 * Baca plan user dari tabel user_usage untuk tentukan watermark + prefix R2.
 * Fail-open: jika DB error → anggap free (aman: watermark tetap terpasang).
 */
import { getServiceRoleClient } from "./supabase";

export type PlanTier = "free" | "starter" | "pro";

export interface UsageResult {
  plan: PlanTier;
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
}

const FREE_CREDITS = 10;
const STARTER_CREDITS = 30;
const PRO_CREDITS = 100;

const PLAN_CREDITS: Record<PlanTier, number> = {
  free: FREE_CREDITS,
  starter: STARTER_CREDITS,
  pro: PRO_CREDITS,
};

function currentPeriod(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function normalizeRow(row: any): { plan: PlanTier; credits_total: number; credits_used: number } {
  return {
    plan: (row.plan as PlanTier) || "free",
    credits_total: Number(row.credits_total) || FREE_CREDITS,
    credits_used: Number(row.credits_used) || 0,
  };
}

function isFunctionNotFound(error: { code?: string; message?: string } | null): boolean {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return code === "PGRST202" || message.includes("Could not find the function");
}

/**
 * Get usage untuk identity (anon atau login).
 * Login → keyed by user_id; anon → keyed by identity_key.
 */
export async function getUsage(identityKey: string, userId?: string | null): Promise<UsageResult> {
  const supabase = getServiceRoleClient();
  const period = currentPeriod();

  // Jalur login: keyed by user_id
  if (userId) {
    try {
      const { data, error } = await supabase
        .rpc("ensure_usage_row_by_user", { p_user_id: userId, p_period: period })
        .maybeSingle();
      if (!error && data) {
        const r = normalizeRow(data);
        return {
          plan: r.plan,
          creditsTotal: r.credits_total,
          creditsUsed: r.credits_used,
          creditsRemaining: Math.max(0, r.credits_total - r.credits_used),
        };
      }
      if (error && !isFunctionNotFound(error)) {
        console.warn("[usage] ensure_usage_row_by_user error:", error.message);
      }
    } catch (e) {
      console.warn("[usage] ensure_usage_row_by_user throw:", e instanceof Error ? e.message : e);
    }
    // Fallback: select langsung
    return fetchAnonFallback(supabase, identityKey, period);
  }

  // Jalur anon: keyed by identity_key
  return fetchAnonFallback(supabase, identityKey, period);
}

async function fetchAnonFallback(
  supabase: ReturnType<typeof getServiceRoleClient>,
  identityKey: string,
  period: string
): Promise<UsageResult> {
    const { data, error } = await supabase
      .rpc("ensure_usage_row", { p_identity_key: identityKey, p_period: period })
      .maybeSingle();
    if (!error && data) {
      const r = normalizeRow(data);
      return {
        plan: r.plan,
        creditsTotal: r.credits_total,
        creditsUsed: r.credits_used,
        creditsRemaining: Math.max(0, r.credits_total - r.credits_used),
      };
    }
    if (error && !isFunctionNotFound(error)) {
      console.warn("[usage] ensure_usage_row error:", error.message);
    }
    // Fallback terakhir: free default (fail-open)
    return { plan: "free", creditsTotal: FREE_CREDITS, creditsUsed: 0, creditsRemaining: FREE_CREDITS };
  }
