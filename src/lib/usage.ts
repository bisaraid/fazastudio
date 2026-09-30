/**
 * User Usage / Credit — ACS
 *
 * Credit metering per bulan (period = "YYYY-MM").
 * - Anon:  satu baris unik per (identity_key, period) → identity_key = "anon:<device>".
 * - Login: satu baris unik per (user_id, period)       → metering terikat ke AKUN,
 *          bukan device_id/cookie (migration 018).
 *
 * RULE (Finish plan STEP 3): decrement hanya ONCE per project, di
 * /api/generate-script (one project = one credit). Jadi:
 * - generate-script  → decrementCredit() / decrementCreditForUser()  [actually charge]
 * - tts/subtitle/video → checkCredits() / checkCreditsForUser()      [402 if exhausted, NO decrement]
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
import {
  describeSupabaseError,
  formatSupabaseError,
  maskId,
  type SupabaseErrorInfo,
} from "@/lib/db-error";

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

// ============================================================
// STATUS DEBET EKSPLISIT (Fase 4A) — refund HANYA untuk "charged"
// ============================================================
/**
 * `charged`   → kredit BENAR-BENAR terpotong di period ini (aman untuk refund).
 * `exhausted` → kuota habis / row belum ada → request ditolak 402 (tanpa debet).
 * `failopen`  → error DB/network (bukan "function not found") → kredit TIDAK
 *               terpotong tetapi request diizinkan. JANGAN refund jalur ini,
 *               karena tidak ada yang dipotong (refund akan membuat saldo naik).
 */
export type DebitStatus = "charged" | "exhausted" | "failopen";

export interface DebitResult {
  status: DebitStatus;
  /** Period (YYYY-MM) yang dipakai debet — WAJIB diteruskan apa adanya ke refund. */
  period: string;
}


/**
 * `identity_key` untuk baris jalur AKUN.
 *
 * Kolom `identity_key` masih `not null` (migration 003) dan TIDAK punya default,
 * sedangkan baris akun dikenali lewat `user_id`. Tanpa nilai ini, INSERT jalur
 * akun selalu ditolak Postgres dengan 23502:
 *   null value in column "identity_key" of relation "user_usage"
 *   violates not-null constraint
 * Nilai deterministik `account:<user_id>` juga menjaga unique index
 * (identity_key, period) tetap konsisten per akun dan tidak pernah bentrok
 * dengan jalur anon (`anon:<device>`).
 * Migration 028 melonggarkan constraint-nya; kode ini tetap mengisi nilainya
 * supaya tetap bekerja sebelum migration dijalankan.
 */
export function accountIdentityKey(userId: string): string {
  return `account:${userId}`;
}

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
export async function decrementCredit(identityKey: string): Promise<DebitResult> {
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
        const charged = await fallbackDecrementCredit(identityKey, period);
        return { status: charged ? "charged" : "exhausted", period };
      }
      // Error DB lain — fail-open konsisten doctrine codebase.
      console.warn("[usage] decrementCredit error (fail-open):", error.message);
      return { status: "failopen", period };
    }

    // data === null → UPDATE tidak match → kuota habis / row belum ada.
    const charged = data !== null && data !== undefined;
    return { status: charged ? "charged" : "exhausted", period };
  } catch (e) {
    console.warn("[usage] decrementCredit RPC error (fail-open):", e instanceof Error ? e.message : e);
    return { status: "failopen", period };
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

// ============================================================
// METERING KEYED BY AKUN (user_id) — migration 018
// Jalur login: metering terikat ke akun, bukan device/cookie.
// Jalur anon tetap diperlakukan via function lama (identity_key).
// ============================================================

/** Get-or-create row ATOMIC keyed by user_id — primary RPC by_user (018). */
async function fetchOrCreateByUser(userId: string, period: string): Promise<UsageRow> {
  const supabase = createServiceRoleClient();

  // Primary: atomic RPC — satu round-trip, keyed by user_id.
  try {
    const { data, error } = await supabase
      .rpc("ensure_usage_row_by_user", {
        p_user_id: userId,
        p_period: period,
      })
      .maybeSingle();

    if (!error && data) {
      return normalizeRow(data);
    }
    if (error && !isFunctionNotFound(error)) {
      // Error bukan "function not found" — log ter-redaksi, lanjut fallback.
      console.warn(
        "[usage] ensure_usage_row_by_user error: " +
          formatSupabaseError(describeSupabaseError(error))
      );
    }
  } catch (e) {
    console.warn(
      "[usage] ensure_usage_row_by_user exception: " +
        formatSupabaseError(describeSupabaseError(e))
    );
  }

  // Fallback: legacy get-then-insert keyed by user_id (sebelum migration 018 deploy).
  return fetchOrCreateLegacyByUser(supabase, userId, period);
}

/** Legacy get-then-insert keyed by user_id — transisi sebelum migration 018. */
async function fetchOrCreateLegacyByUser(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  period: string
): Promise<UsageRow> {
  const { data: existing, error } = await supabase
    .from(USAGE_TABLE)
    .select("plan, credits_total, credits_used")
    .eq("user_id", userId)
    .eq("period", period)
    .maybeSingle();

  if (!error && existing) {
    return normalizeRow(existing);
  }

  const defaults: UsageRow = { plan: "free", credits_total: FREE_CREDITS, credits_used: 0 };
  try {
    const { data: created, error: createError } = await supabase
      .from(USAGE_TABLE)
      .insert({
        user_id: userId,
        // `identity_key` masih `not null` (migration 003) → WAJIB diisi di jalur
        // akun. Dulu error 23502 dari insert ini TERTELAN (hanya `data` yang
        // dibaca), sehingga fungsi diam-diam mengembalikan default tanpa baris
        // dan seluruh metering akun (018) tidak pernah tersimpan.
        identity_key: accountIdentityKey(userId),
        period,
        plan: "free",
        credits_total: FREE_CREDITS,
        credits_used: 0,
      })
      .select("plan, credits_total, credits_used")
      .maybeSingle();

    if (createError) {
      console.warn(
        `[usage] gagal membuat baris usage akun: user=${maskId(userId)} period=${period} ` +
          formatSupabaseError(describeSupabaseError(createError))
      );
    } else if (created) {
      return normalizeRow(created);
    }
  } catch (e) {
    console.warn(
      `[usage] gagal menyimpan usage row by user: user=${maskId(userId)} ` +
        formatSupabaseError(describeSupabaseError(e))
    );
  }

  return defaults;
}

/** Baca usage keyed by user_id — auto-creates free/default row jika belum ada. */
export async function getUsageForUser(userId: string): Promise<UsageResult> {
  const period = currentPeriod();
  const row = await fetchOrCreateByUser(userId, period);
  return {
    plan: row.plan,
    creditsTotal: row.credits_total,
    creditsUsed: row.credits_used,
    creditsRemaining: Math.max(0, row.credits_total - row.credits_used),
  };
}

/**
 * DECREMENT credit keyed by user_id — panggil ONCE per project di
 * /api/generate-script voor user login. Atomic via RPC by_user (018).
 */
export async function decrementCreditForUser(userId: string): Promise<DebitResult> {
  const period = currentPeriod();
  const supabase = createServiceRoleClient();

  try {
    const { data, error } = await supabase.rpc("decrement_credit_by_user", {
      p_user_id: userId,
      p_period: period,
    });

    if (error) {
      if (isFunctionNotFound(error)) {
        // Migration 018 belum deploy → guarded fallback (never overspend).
        console.warn("[usage] decrement_credit_by_user RPC belum tersedia, fallback guarded");
        const charged = await fallbackDecrementCreditByUser(userId, period);
        return { status: charged ? "charged" : "exhausted", period };
      }
      // Error DB lain — fail-open konsisten doc codebase.
      console.warn(
        "[usage] decrementCreditForUser error (fail-open): " +
          formatSupabaseError(describeSupabaseError(error))
      );
      return { status: "failopen", period };
    }

    // data === null → UPDATE tidak match → kuota habis / row belum ada.
    const charged = data !== null && data !== undefined;
    return { status: charged ? "charged" : "exhausted", period };
  } catch (e) {
    console.warn(
      "[usage] decrementCreditForUser RPC error (fail-open): " +
        formatSupabaseError(describeSupabaseError(e))
    );
    return { status: "failopen", period };
  }
}

/** Fallback guarded decrement keyed by user_id — CAS anti-lost-update. */
async function fallbackDecrementCreditByUser(userId: string, period: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const MAX_ATTEMPTS = 12;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const row = await fetchOrCreateByUser(userId, period);
    if (row.credits_total <= 0 || row.credits_used >= row.credits_total) return false;

    const { data, error } = await supabase
      .from(USAGE_TABLE)
      .update({
        credits_used: row.credits_used + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("period", period)
      .eq("credits_used", row.credits_used)
      .lt("credits_used", row.credits_total)
      .select("credits_used")
      .maybeSingle();

    if (error) {
      console.warn(
        "[usage] fallback by-user decrement error (fail-open): " +
          formatSupabaseError(describeSupabaseError(error))
      );
      return true;
    }

    if (data !== null && data !== undefined) {
      return true;
    }

    if (attempt < MAX_ATTEMPTS) {
      console.debug(`[usage] fallback CAS miss by user (attempt ${attempt}/${MAX_ATTEMPTS})`);
    }
  }

  console.warn("[usage] fallback CAS by user exhausted — debit tidak dipakai (coba lagi)");
  return false;
}

/** CHECK credit keyed by user_id — use for tts/subtitle/video ketika login. */
export async function checkCreditsForUser(userId: string): Promise<boolean> {
  const period = currentPeriod();
  const row = await fetchOrCreateByUser(userId, period);
  return row.credits_total > 0 && row.credits_used < row.credits_total;
}

// ============================================================
// REFUND KREDIT (Fase 4A) — butuh migration 031_credit_refund.sql
// ============================================================
// Aturan pemakaian (dipatuhi src/lib/credit-refund.ts):
//   1. Refund HANYA bila debet berstatus "charged" di request yang sama.
//   2. Kunci idempotensi deterministik per kejadian (mis. script:<projectId>:<requestId>)
//      ⇒ pemanggilan kedua tidak menambah saldo (RPC membalas -1).
//   3. Period yang dikirim adalah PERIOD DEBET, bukan period saat refund dipanggil.
//   4. Fungsi di sini TIDAK PERNAH throw dan tidak pernah menggagalkan respons
//      error yang sedang dikirim: RPC belum deploy → "unavailable", error
//      sementara → 1× retry lalu "error" (log saja).

export type RefundStatus = "refunded" | "already" | "unavailable" | "error";

export interface RefundResult {
  status: RefundStatus;
  /** `credits_used` setelah refund; null bila tidak ada yang dikembalikan. */
  creditsUsed: number | null;
}

export interface RefundOptions {
  /** Period DEBET (YYYY-MM) — bukan `currentPeriod()` saat refund. */
  period: string;
  /** Kunci idempotensi per kejadian (deterministik, bukan acak). */
  idempotencyKey: string;
  reason?: string;
}

/** 1 percobaan + 1 retry untuk error sementara (network/5xx). */
const REFUND_MAX_ATTEMPTS = 2;

/** Terjemahkan nilai balik RPC: -1 = sudah pernah di-refund (sukses idempoten). */
function interpretRefund(data: unknown): RefundResult {
  if (data === -1) return { status: "already", creditsUsed: null };
  if (typeof data === "number") return { status: "refunded", creditsUsed: data };
  return { status: "error", creditsUsed: null };
}

/** Refund jalur ANON. Tidak pernah throw. */
export async function refundCredit(
  identityKey: string,
  opts: RefundOptions
): Promise<RefundResult> {
  const supabase = createServiceRoleClient();

  for (let attempt = 1; attempt <= REFUND_MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await supabase.rpc("refund_credit", {
        p_identity_key: identityKey,
        p_period: opts.period,
        p_idempotency_key: opts.idempotencyKey,
        p_reason: opts.reason ?? null,
      });

      if (!error) return interpretRefund(data);

      if (isFunctionNotFound(error)) {
        // Migration 031 belum deploy → refund dilewati (bukan kegagalan request).
        console.warn("[usage] refund_credit RPC belum tersedia — refund dilewati");
        return { status: "unavailable", creditsUsed: null };
      }
      console.warn(
        `[usage] refundCredit error (attempt ${attempt}/${REFUND_MAX_ATTEMPTS}): ${error.message}`
      );
    } catch (e) {
      console.warn(
        `[usage] refundCredit throw (attempt ${attempt}/${REFUND_MAX_ATTEMPTS}): ` +
          formatSupabaseError(describeSupabaseError(e))
      );
    }
  }

  return { status: "error", creditsUsed: null };
}

/** Refund jalur AKUN (user_id) — mirror 018/028. Tidak pernah throw. */
export async function refundCreditForUser(
  userId: string,
  opts: RefundOptions
): Promise<RefundResult> {
  const supabase = createServiceRoleClient();

  for (let attempt = 1; attempt <= REFUND_MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await supabase.rpc("refund_credit_by_user", {
        p_user_id: userId,
        p_period: opts.period,
        p_idempotency_key: opts.idempotencyKey,
        p_reason: opts.reason ?? null,
      });

      if (!error) return interpretRefund(data);

      if (isFunctionNotFound(error)) {
        console.warn("[usage] refund_credit_by_user RPC belum tersedia — refund dilewati");
        return { status: "unavailable", creditsUsed: null };
      }
      console.warn(
        `[usage] refundCreditForUser error (attempt ${attempt}/${REFUND_MAX_ATTEMPTS}): ${error.message}`
      );
    } catch (e) {
      console.warn(
        `[usage] refundCreditForUser throw (attempt ${attempt}/${REFUND_MAX_ATTEMPTS}): ` +
          formatSupabaseError(describeSupabaseError(e))
      );
    }
  }

  return { status: "error", creditsUsed: null };
}

/** Hasil penulisan plan keyed by user_id (kegagalan membawa penyebabnya). */
export interface PlanWriteResult {
  ok: boolean;
  /** Langkah tempat penulisan berakhir (sukses/gagal). */
  stage: "update" | "insert";
  /** Penyebab kegagalan Supabase SUDAH ter-redaksi (aman untuk log). */
  error: SupabaseErrorInfo | null;
}

/** Catat kegagalan tulis plan: code/message/details/hint ter-redaksi + user ter-masker. */
function failPlanWrite(
  stage: "update" | "insert",
  userId: string,
  period: string,
  rawError: unknown
): PlanWriteResult {
  const error = describeSupabaseError(rawError);
  console.warn(
    `[usage] setPlanForUser gagal: stage=${stage} period=${period} ` +
      `user=${maskId(userId)} ${formatSupabaseError(error)}`
  );
  return { ok: false, stage, error };
}

/**
 * SET PLAN keyed by user_id — versi DETIL (menyertakan penyebab kegagalan).
 *
 * Kenapa bukan `upsert({ onConflict: "user_id,period" })` lagi:
 *  1. `upsert` mensyaratkan unique index (user_id, period) SUDAH ada; kalau
 *     belum (migration 018 belum jalan) Postgres membalas 42P10.
 *  2. Baris akun butuh INSERT tanpa `identity_key`, sedang kolom itu `not null`
 *     sejak migration 003 → 23502. Inilah penyebab nyata "Gagal memperbarui
 *     plan" untuk user yang sudah terdaftar (barisnya belum pernah tercipta,
 *     sehingga selalu jatuh ke cabang INSERT).
 *
 * Urutan UPDATE → (bila 0 baris) INSERT dengan `identity_key` eksplisit bekerja
 * baik sebelum MAUPUN sesudah migration 028 dijalankan, dan tidak menyentuh
 * lifecycle/expiry plan (hanya plan + kuota bulan berjalan).
 */
export async function setPlanForUserDetailed(
  userId: string,
  plan: PlanTier
): Promise<PlanWriteResult> {
  const period = currentPeriod();
  const supabase = createServiceRoleClient();
  const patch = {
    plan,
    credits_total: PLAN_CREDITS[plan] ?? FREE_CREDITS,
    credits_used: 0,
    updated_at: new Date().toISOString(),
  };

  // Langkah terakhir yang sedang dijalankan — dipakai bila promise melempar
  // (mis. jaringan mati) supaya log tetap menyebut tahap yang benar.
  let stage: "update" | "insert" = "update";

  try {
    // 1) UPDATE baris periode berjalan milik akun (jalur normal).
    const { data: updatedRows, error: updateError } = await supabase
      .from(USAGE_TABLE)
      .update(patch)
      .eq("user_id", userId)
      .eq("period", period)
      .select("id");

    if (updateError) {
      return failPlanWrite(stage, userId, period, updateError);
    }
    if (Array.isArray(updatedRows) && updatedRows.length > 0) {
      return { ok: true, stage, error: null };
    }

    // 2) Belum ada baris → INSERT (identity_key WAJIB: `not null` di 003).
    stage = "insert";
    const { error: insertError } = await supabase.from(USAGE_TABLE).insert({
      user_id: userId,
      identity_key: accountIdentityKey(userId),
      period,
      ...patch,
    });

    if (!insertError) {
      return { ok: true, stage, error: null };
    }

    // 3) Balapan dengan request lain (23505) → baris sudah dibuat, ulangi UPDATE.
    if (insertError.code === "23505") {
      stage = "update";
      const { data: retryRows, error: retryError } = await supabase
        .from(USAGE_TABLE)
        .update(patch)
        .eq("user_id", userId)
        .eq("period", period)
        .select("id");

      if (!retryError && Array.isArray(retryRows) && retryRows.length > 0) {
        return { ok: true, stage, error: null };
      }
      return failPlanWrite(stage, userId, period, retryError ?? insertError);
    }

    return failPlanWrite(stage, userId, period, insertError);
  } catch (e) {
    // Error jaringan / exception tak terduga — jangan dilempar ke route
    // (respons JSON tetap dibentuk, penyebab masuk log ter-redaksi).
    return failPlanWrite(stage, userId, period, e);
  }
}

/**
 * SET PLAN keyed by user_id — wrapper boolean (kompatibel pemanggil lama:
 * webhook checkout & route admin). Penyebab kegagalan sudah di-log di dalam
 * `setPlanForUserDetailed`.
 */
export async function setPlanForUser(userId: string, plan: PlanTier): Promise<boolean> {
  const result = await setPlanForUserDetailed(userId, plan);
  return result.ok;
}