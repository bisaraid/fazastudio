/**
 * User Usage / Credit — ACS
 *
 * Credit metering per identity per bulan (period = "YYYY-MM").
 * Satu baris unik per (identity_key, period) di tabel `user_usage`.
 *
 * RULE (Finish plan STEP 3): decrement hanya ONCE per project, di
 * /api/generate-script (one project = one credit). Jadi:
 * - generate-script  → decrementCredit()   [actually charge]
 * - tts/subtitle/video → checkCredits()     [go to 402 if exhausted, NO decrement]
 *
 * ATOMICITY (Sesi 1 fix — migration 014):
 * - fetchOrCreate   → RPC ensure_usage_row()  (INSERT..ON CONFLICT DO NOTHING + SELECT,
 *                     satu query round-trip; idempoten)
 * - decrementCredit → RPC decrement_credit()  (UPDATE..SET credits_used = credits_used + 1
 *                     WHERE credits_used < credits_total RETURNING credits_used)
 * - checkCredits    → fetchOrCreate (read-only)
 *
 * Postgres row-lock membuat concurrent UPDATE serialized: request kedua
 * WHERE-nya dievaluasi atas baris yang sudah commit — jika kuota habis,
 * RETURNING kosong → decrement return false. TIDAK overspend.
 *
 * Fallback:
 * - RPC function belum deploy (PGRST202) → guarded fallback
 *   (.lt("credits_used", credits_total)) — TIDAK overspend, worst case
 *   under-count (aman untuk bisnis).
 * - DB down / network error → fail-open (log + allow), konsisten dengan
 *   deploy fail-open strategy rate-limit di codebase.
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

const USAGE_TABLE = "user_usage";

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

function normalizeRow(row: any): UsageRow {
  return {
    plan: (row.plan as PlanTier) || "free",
    credits_total: Number(row.credits_total) || FREE_CREDITS,
    credits_used: Number(row.credits_used) || 0,
  };
}

/** Detect PostgREST "function not found" (PGRST202) → migration belum deploy. */
function isFunctionNotFound(error: { code?: string; message?: string } | null): boolean {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return code === "PGRST202" || message.includes("Could not find the function");
}

/**
 * Get-or-create row ATOMIC via RPC `ensure_usage_row` (migration 014).
 * Fallback: legacy get-then-insert (temporary) jika function belum deploy.
 */
async function fetchOrCreate(identityKey: string, period: string): Promise<UsageRow> {
  const supabase = createServiceRoleClient();

  // Primary: atomic RPC — satu round-trip.
  try {
    const { data, error } = await supabase
      .rpc("ensure_usage_row", {
        p_identity_key: identityKey,
        p_period: period,
      })
      .maybeSingle();

    if (!error && data) {
      return normalizeRow(data);
    }
    if (error && !isFunctionNotFound(error)) {
      // Error yang bukan "function not found" — log, lanjut fallback.
      console.warn("[usage] ensure_usage_row unexpected error:", error.message);
    }
  } catch (e) {
    console.warn("[usage] ensure_usage_row error:", e instanceof Error ? e.message : e);
  }

  // Fallback: legacy get-then-insert (sebelum migration 014 deploy).
  return fetchOrCreateLegacy(supabase, identityKey, period);
}

/** Legacy get-then-insert — hanya untuk transisi sebelum migration 014. */
async function fetchOrCreateLegacy(
  supabase: ReturnType<typeof createServiceRoleClient>,
  identityKey: string,
  period: string
): Promise<UsageRow> {
  const { data: existing, error } = await supabase
    .from(USAGE_TABLE)
    .select("plan, credits_total, credits_used")
    .eq("identity_key", identityKey)
    .eq("period", period)
    .maybeSingle();

  if (!error && existing) {
    return normalizeRow(existing);
  }

  const defaults: UsageRow = { plan: "free", credits_total: FREE_CREDITS, credits_used: 0 };
  try {
    const { data: created } = await supabase
      .from(USAGE_TABLE)
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
      return normalizeRow(created);
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
 * ATOMIC via RPC `decrement_credit` (conditional update, row-lock).
 * Return false jika kredit habis (402).
 *
 * Fail-open: hanya untuk network/DB error yang bukan "function not found" —
 * setelah migration 014 deploy, jalur normal selalu atomic.
 */
export async function decrementCredit(identityKey: string): Promise<boolean> {
  const period = currentPeriod();
  const supabase = createServiceRoleClient();

  // Primary: atomic RPC — UPDATE..SET credits_used = credits_used + 1
  // WHERE credits_used < credits_total RETURNING credits_used.
  // Postgres row-lock serializes concurrent requests → tidak overspend.
  try {
    const { data, error } = await supabase.rpc("decrement_credit", {
      p_identity_key: identityKey,
      p_period: period,
    });

    if (error) {
      if (isFunctionNotFound(error)) {
        // Migration 014 belum deploy → guarded fallback (never overspend).
        console.warn("[usage] decrement_credit RPC belum tersedia, fallback guarded");
        return fallbackDecrementCredit(identityKey, period);
      }
      // Error DB lain — fail-open konsisten doctrine codebase.
      console.warn("[usage] decrementCredit error (fail-open):", error.message);
      return true;
    }

    // data === null → UPDATE tidak match → kuota habis / row belum ada.
    return data !== null && data !== undefined;
  } catch (e) {
    console.warn("[usage] decrementCredit RPC error (fail-open):", e instanceof Error ? e.message : e);
    return true;
  }
}

/**
 * Fallback guarded decrement — hanya sebelum migration 014 deploy.
 *
 * ANTI-LOST-UPDATE (optimistic concurrency / CAS):
 *  - Baca row fresh.
 *  - UPDATE ... SET credits_used = row.credits_used + 1
 *    WHERE credits_used = row.credits_used   ← version check (CAS)
 *      AND credits_used < credits_total      ← boundary guard
 *  - Jika 0 row match (nilai berubah antara baca & update) → retry
 *    (max 3) dengan baca fresh.
 *  - Ini menghindar lost-update: dua request concurrent yang baca
 *    nilai sama tidak dua-dua SET atas same base — satu sukses,
 *    lainnya retry/false. Without CAS (kode lama), dua request baca
 *    used=0 → dua-dua SET 1 → kredit under-count (overspend).
 *
 * NOTE: setelah migration 014 deploy, jalur RPC atomic dipakai.
 * Fallback ini hanya transisi.
 */
async function fallbackDecrementCredit(identityKey: string, period: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const MAX_ATTEMPTS = 12;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const row = await fetchOrCreate(identityKey, period);
    if (row.credits_total <= 0 || row.credits_used >= row.credits_total) return false;

    // CAS: WHERE credits_used = <nilai yang kita baca> — jika sudah berubah
    // oleh request lain, UPDATE tidak match → retry dengan baca kerbaru.
    const { data, error } = await supabase
      .from(USAGE_TABLE)
      .update({
        credits_used: row.credits_used + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("identity_key", identityKey)
      .eq("period", period)
      .eq("credits_used", row.credits_used)
      .lt("credits_used", row.credits_total)
      .select("credits_used")
      .maybeSingle();

    if (error) {
      console.warn("[usage] fallback decrement error (fail-open):", error.message);
      return true;
    }

    if (data !== null && data !== undefined) {
      return true;
    }

    // 0 row match — lost-update ter-avoid; retry kerbaru bila masih ada kredit.
    if (attempt < MAX_ATTEMPTS) {
      console.debug(`[usage] fallback CAS miss (attempt ${attempt}/${MAX_ATTEMPTS})`);
    }
  }

  // MAX_ATTEMPTS habis tanpa success — conservatif: return false (kredit tidak
  // ter-decrement; user bisa coba lagi). More aman daripada overspend.
  console.warn("[usage] fallback CAS exhausted attempts — debit tidak dipakai (coba lagi)");
  return false;
}

/**
 * CHECK credit (TIDAK decrement) — use for tts/subtitle/video.
 * Return false → route response 402 (credit habis) without charging user
 * again (project sudah di-kredit di generate-script).
 */
export async function checkCredits(identityKey: string): Promise<boolean> {
  const period = currentPeriod();
  const row = await fetchOrCreate(identityKey, period);
  return row.credits_total > 0 && row.credits_used < row.credits_total;
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

  const { error } = await supabase.from(USAGE_TABLE).upsert(
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