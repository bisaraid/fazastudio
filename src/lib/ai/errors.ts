/**
 * Klasifikasi kegagalan provider AI — murni (tanpa I/O), mudah diuji.
 *
 * Aturan bisnis: pindah ke provider cadangan (OpenRouter) bila Groq memberi
 *   - 404 / code model_not_found / model decommissioned → "model_not_found"
 *   - 429 atau code rate_limit_exceeded                  → "rate_limit"
 *   - 402 / code insufficient_quota                      → "quota"
 *   - 5xx                                                → "server_error"
 *   - timeout / 408 / 504                                → "timeout"
 *   - error jaringan (fetch reject)                      → "network"
 *   - 401/403 (key tidak valid/kadaluarsa)               → "auth"
 *   - API key tidak ada di env                           → "missing_key"
 *   - respons bukan JSON valid (saat JSON diwajibkan)    → "bad_json"
 * Sedangkan 400/413/422 (permintaan salah) TIDAK memicu fallback karena
 * provider cadangan akan menolak hal yang sama (gagal jelas, bukan retry).
 */

export type AiProviderName = "groq" | "openrouter";
export type AiFailureKind = "http" | "network" | "timeout" | "parse" | "missing_key";
export type AiFailoverReason =
  | "model_not_found"
  | "rate_limit"
  | "quota"
  | "server_error"
  | "timeout"
  | "network"
  | "auth"
  | "missing_key"
  | "bad_json"
  | "none";

export interface AiFailureInput {
  kind?: AiFailureKind;
  status?: number;
  /** Kode dari body respons provider (mis. "model_not_found"). */
  code?: string;
  /** Pesan dari body respons provider (dipakai hanya untuk 400/404/tanpa status). */
  message?: string;
}

export interface AiFailureClassification {
  reason: AiFailoverReason;
  failover: boolean;
}

const MODEL_NOT_FOUND_CODES = ["model_not_found", "model_decommissioned", "model_not_available"];
const QUOTA_CODES = ["insufficient_quota", "quota_exceeded", "billing_hard_limit_reached"];
const RATE_LIMIT_CODES = ["rate_limit_exceeded", "rate_limit"];

export function classifyAiFailure(input: AiFailureInput): AiFailureClassification {
  if (input.kind === "missing_key") return { reason: "missing_key", failover: true };
  if (input.kind === "parse") return { reason: "bad_json", failover: true };
  if (input.kind === "timeout") return { reason: "timeout", failover: true };
  if (input.kind === "network") return { reason: "network", failover: true };

  const code = (input.code ?? "").trim().toLowerCase();
  const message = (input.message ?? "").trim().toLowerCase();
  const status = input.status;
  // Pesan provider hanya "dipercaya" untuk 400/404/tanpa status, agar pesan aneh
  // pada status lain tidak salah memicu fallback.
  const messageTrusted = status === undefined || status === 400 || status === 404;

  if (MODEL_NOT_FOUND_CODES.some((c) => code.includes(c))) {
    return { reason: "model_not_found", failover: true };
  }
  if (QUOTA_CODES.some((c) => code.includes(c))) return { reason: "quota", failover: true };
  if (RATE_LIMIT_CODES.some((c) => code.includes(c))) return { reason: "rate_limit", failover: true };

  if (messageTrusted) {
    if (
      message.includes("does not exist") ||
      message.includes("decommissioned") ||
      message.includes("no longer supported") ||
      message.includes("model_not_found")
    ) {
      return { reason: "model_not_found", failover: true };
    }
  }

  if (status === 404) return { reason: "model_not_found", failover: true };
  if (status === 429) return { reason: "rate_limit", failover: true };
  if (status === 402) return { reason: "quota", failover: true };
  if (status === 408 || status === 504) return { reason: "timeout", failover: true };
  if (typeof status === "number" && status >= 500) return { reason: "server_error", failover: true };
  if (status === 401 || status === 403) return { reason: "auth", failover: true };
  return { reason: "none", failover: false };
}

/** Ambil `{ code, message }` dari body error provider (Groq/OpenRouter, format OpenAI). */
export function extractProviderErrorInfo(bodyText: string): { code?: string; message?: string } {
  if (!bodyText) return {};
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const err = parsed?.error;
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      return {
        code: typeof e.code === "string" ? e.code : typeof e.type === "string" ? e.type : undefined,
        message: typeof e.message === "string" ? e.message : undefined,
      };
    }
    if (typeof err === "string") return { message: err };
    if (typeof parsed?.message === "string") return { message: parsed.message };
    return {};
  } catch {
    // Body bukan JSON (mis. halaman error HTML) → pakai potongan teks mentah.
    return { message: bodyText.slice(0, 200) };
  }
}

/** Potong teks untuk log (hindari log raksasa; body respons tidak memuat API key). */
export function truncateForLog(text: string, max = 300): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export interface AiProviderErrorOptions {
  status?: number;
  code?: string;
  detail?: string;
  reason: AiFailoverReason;
  failover: boolean;
}

/** Error transport provider (Groq/OpenRouter) — membawa status + alasan fallback. */
export class AiProviderError extends Error {
  readonly provider: AiProviderName;
  readonly status?: number;
  readonly code?: string;
  readonly detail?: string;
  readonly reason: AiFailoverReason;
  readonly failover: boolean;

  constructor(provider: AiProviderName, message: string, options: AiProviderErrorOptions) {
    super(message);
    this.name = "AiProviderError";
    this.provider = provider;
    this.status = options.status;
    this.code = options.code;
    this.detail = options.detail;
    this.reason = options.reason;
    this.failover = options.failover;
  }
}

export interface AiAttempt {
  provider: AiProviderName;
  model: string;
  status?: number;
  code?: string;
  reason: AiFailoverReason | "ok";
  message?: string;
}

/** Pesan yang layak ditampilkan ke user akhir (bukan detail internal). */
export const AI_UNAVAILABLE_MESSAGE =
  "Layanan AI sedang tidak tersedia (semua provider gagal). Coba lagi beberapa saat.";

/**
 * Kedua provider gagal. Route harus memetakannya ke 503 + pesan jelas,
 * bukan 500 "Internal server error" yang tidak informatif.
 */
export class AiAllProvidersFailedError extends Error {
  readonly status = 503;
  readonly code = "AI_UNAVAILABLE";
  readonly attempts: AiAttempt[];
  readonly userMessage = AI_UNAVAILABLE_MESSAGE;

  constructor(attempts: AiAttempt[], cause?: unknown) {
    const ringkas = attempts
      .map((a) => `${a.provider}:${a.reason}${a.status ? ` (${a.status})` : ""}`)
      .join(" → ");
    super(`Semua provider AI gagal [${ringkas}]`);
    this.name = "AiAllProvidersFailedError";
    this.attempts = attempts;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Petakan error AI → respons HTTP. `null` = bukan error AI (biarkan route
 * memakai penanganan 500 generik).
 */
export function toUserFacingAiError(
  error: unknown
): { status: number; code: string; message: string } | null {
  if (error instanceof AiAllProvidersFailedError) {
    return { status: error.status, code: error.code, message: error.userMessage };
  }
  if (error instanceof AiProviderError) {
    return error.failover
      ? {
          status: 503,
          code: "AI_PROVIDER_ERROR",
          message: `Layanan AI (${error.provider}) sedang tidak tersedia. Coba lagi beberapa saat.`,
        }
      : {
          status: 502,
          code: "AI_PROVIDER_ERROR",
          message: `Permintaan ke layanan AI (${error.provider}) ditolak. Coba lagi atau ubah input.`,
        };
  }
  return null;
}
