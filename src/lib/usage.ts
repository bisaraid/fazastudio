/**
 * User Usage / Credit — ACS
 *
 * Credit metering per identity per bulan (period = "YYYY-MM").
 * Satu baris unik per (identity_key, period) di tabel `user_usage`.
 *
 * RULE (Finish plan STEP 3): decrement hanya ONCE per project, di
 * /api/generate-script (one project = one credit). Jadi:
 * - generate-script  → decrementCredit()   [actually charge]
 * - tts/subtitle/video → checkCredit()     [go to 402 if exhausted, NO decrement]
 *
 * identity_key = 'anon:<ip>' untuk MVP (belum integrasi cookie/auth penuh).
 */

import { createServiceRoleClient } from "@/lib/supabase/service";

export type PlanTier = "free" | "starter" | "pro";

export interface UsageResult {
  plan: PlanTier;
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
}

// Free plan default = 10 kredit (matching PLANS in constants).
export const FREE_CREDITS = 10;
export const STARTER_CREDITS = 30;
export const PRO_CREDITS = 100;

const PLAN_CREDITS: Record<PlanTier, number> = {
  free: FREE_CREDITS,
  starter: STARTER_CREDITS,
  pro: PRO_CREDITS,
};

/** Periode bulan aktuell: YYYY-MM */
function currentPeriod(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

interface UsageRow {
  plan: PlanTier;
  credits_total: number;
  credits_used: number;
}

/**
 * Ambil baris usage untuk identity+period, BANGUN dengan default free jika
 * belum ada. (MVP: single get-then-insert — race kecil ignorable.)
 */
async function fetchOrCreate(identityKey: string, period: string): Promise<UsageRow> {
  const supabase = createServiceRoleClient();

  const { data: existing, error } = await supabase
    .from("user_usage")
    .select("plan, credits_total, credits_used")
    .eq("identity_key", identityKey)
    .eq("period", period)
    .maybeSingle();

  if (!error && existing) {
    return {
      plan: (existing.plan as PlanTier) || "free",
      credits_total: Number(existing.credits_total) || FREE_CREDITS,
      credits_used: Number(existing.credits_used) || 0,
    };
  }

  const defaults: UsageRow = { plan: "free", credits_total: FREE_CREDITS, credits_used: 0 };
  try {
    const { data: created } = await supabase
      .from("user_usage")
      .insert({
        identity_key: identityKey,
        period,
        plan: "free",
        credits_total: FREE_CREDITS,
        credits_used: 0,
      })
      .select("plan, credits_total, credits_used")
      .single();

    if (created) {
      return {
        plan: (created.plan as PlanTier) || "free",
        credits_total: Number(created.credits_total) || FREE_CREDITS,
        credits_used: Number(created.credits_used) || 0,
      };
    }
  } catch (e) {
    console.warn("[usage] Gagal menyimpan usage row baru:", e);
  }

  return defaults;
}

/** Baca usage current — auto-creates free/default row jika belum ada. */
export async function getUsage(identityKey: string): Promise<UsageResult> {
  const period = currentPeriod();
  const row = await fetchOrCreate(identityKey, period);
  return {
    plan: row.plan,
    creditsTotal: row.credits_total,
    creditsUsed: row.credits_used,
    creditsRemaining: Math.max(0, row.credits_total - row.credits_used),
  };
}

/**
 * DECREMENT credit — panggil ONCE per project di /api/generate-script.
 * Return false jika credit habis (402). Fail-open: jika DB error, log warning
 * dan allow request (konsisten dengan fail-open strategy rate-limit di codebase).
 */
export async function decrementCredit(identityKey: string): Promise<boolean> {
  const period = currentPeriod();
  const row = await fetchOrCreate(identityKey, period);

  if (row.credits_used >= row.credits_total) {
    return false;
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("user_usage")
    .update({ credits_used: row.credits_used + 1, updated_at: new Date().toISOString() })
    .eq("identity_key", identityKey)
    .eq("period", period);

  if (error) {
    console.warn("[usage] decrementCredit error (fail-open):", error.message);
  }
  return true;
}

/**
 * CHECK credit (TIDAK decrement) — use for tts/subtitle/video.
 * Return false → route response 402 (credit habis) without charging user
 * again (project sudah di-kredit di generate-script).
 */
export async function checkCredits(identityKey: string): Promise<boolean> {
  const period = currentPeriod();
  const row = await fetchOrCreate(identityKey, period);
  return row.credits_used < row.credits_total;
}

/**
 * SET PLAN — upgrade flow (checkout webhook).
 * Set plan + credits_total sesuai tier, reset credits_used ke 0.
 */
export async function setPlan(identityKey: string, plan: PlanTier): Promise<boolean> {
  const period = currentPeriod();
  const supabase = createServiceRoleClient();

  // Pastikan baris ada (create with default free jika not exist).
  await fetchOrCreate(identityKey, period);

  const { error } = await supabase.from("user_usage").upsert(
    {
      identity_key: identityKey,
      period,
      plan,
      credits_total: PLAN_CREDITS[plan] ?? FREE_CREDITS,
      credits_used: 0,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "identity_key,period",
    }
  );

  if (error) {
    console.warn("[usage] setPlan error:", error.message);
    return false;
  }
  return true;
}