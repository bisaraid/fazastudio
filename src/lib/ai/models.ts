/**
 * Resolusi model AI — Faza Studio
 *
 * SATU tempat untuk menentukan nama model tiap provider (Groq utama, OpenRouter
 * cadangan). Nama model TIDAK boleh lagi ditulis langsung di route/engine:
 * selalu lewat env dengan default yang valid (lihat .env.example).
 *
 * Konteks (halaman deprecation Groq, dicek 1 Okt 2026):
 * - `llama-3.3-70b-versatile` + `llama-3.1-8b-instant` dihentikan 16 Agustus 2026.
 *   Pengganti resmi dari halaman deprecation:
 *     llama-3.3-70b-versatile → `openai/gpt-oss-120b`
 *     llama-3.1-8b-instant    → `openai/gpt-oss-20b`
 * - `whisper-large-v3-turbo` (subtitle) MASIH Production ($0.04/jam) → tidak diubah.
 * - `qwen/qwen3.8-27b` berstatus Preview → tidak dipakai sebagai model utama.
 *
 * Semua fungsi membaca `process.env` SAAT DIPANGGIL (bukan saat import) supaya
 * env bisa di-override di test tanpa reload modul.
 */

export type AiModelTier = "main" | "light";
export type AiReasoningEffort = "low" | "medium" | "high";
export type GroqKeySource = "primary" | "secondary";

/**
 * Bentuk env minimal yang dipakai modul ini (mudah diuji: cukup objek biasa,
 * tidak perlu `NodeJS.ProcessEnv` lengkap).
 */
export type EnvLike = Record<string, string | undefined>;

/** Model Groq untuk tugas berat (script) — pengganti llama-3.3-70b-versatile. */
export const GROQ_MODEL_MAIN_DEFAULT = "openai/gpt-oss-120b";
/** Model Groq untuk tugas ringan (caption, ide, terjemahan, klasifikasi). */
export const GROQ_MODEL_LIGHT_DEFAULT = "openai/gpt-oss-20b";
/** Model cadangan OpenRouter: murah, stabil, JSON mode OK ($0.15/$0.60 per 1M). */
export const OPENROUTER_MODEL_DEFAULT = "openai/gpt-4o-mini";

/**
 * Timeout per permintaan (ms). Dijaga di bawah limit function Vercel (60s):
 * Groq 15s + OpenRouter 30s = 45s worst-case satu pemanggilan fitur.
 */
export const AI_TIMEOUT_MS = { groq: 15_000, openrouter: 30_000 } as const;

/**
 * Model Groq yang sudah dihentikan. Bila nilai lama masih tertinggal di env
 * (mis. GROQ_MODEL=llama-3.3-70b-versatile), nilai itu DIABAIKAN agar tidak
 * memicu 404 model_not_found lagi.
 */
const DEPRECATED_GROQ_MODELS = new Set<string>([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
  "llama-3.3-70b-specdec",
  "llama-3.1-70b-specdec",
  "llama3-70b-8192",
  "llama3-8b-8192",
  "llama3-groq-8b-8192-tool-use-preview",
  "llama3-groq-70b-8192-tool-use-preview",
  "mixtral-8x7b-32768",
  "gemma-7b-it",
  "gemma2-9b-it",
  "deepseek-r1-distill-llama-70b",
  "deepseek-r1-distill-qwen-32b",
  "qwen-2.5-32b",
  "qwen-2.5-coder-32b",
  "qwen-qwq-32b",
]);

/** Prefix model lama (semua varian di bawah prefix ini sudah ditarik Groq). */
const DEPRECATED_PREFIXES = ["llama-3.1-", "llama-3.2-", "llama3-", "gemma2-", "mixtral-"];

function readEnv(env: EnvLike, key: string): string {
  const raw = env[key];
  return typeof raw === "string" ? raw.trim() : "";
}

export function isDeprecatedGroqModel(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (!id) return false;
  if (DEPRECATED_GROQ_MODELS.has(id)) return true;
  return DEPRECATED_PREFIXES.some((p) => id.startsWith(p));
}

/**
 * Model Groq untuk tier tertentu.
 * Urutan: env tier (GROQ_MODEL_MAIN/LIGHT) → legacy GROQ_MODEL (bila masih valid)
 * → default produksi.
 */
export function resolveGroqModel(tier: AiModelTier, env: EnvLike = process.env): string {
  const tierValue = readEnv(env, tier === "main" ? "GROQ_MODEL_MAIN" : "GROQ_MODEL_LIGHT");
  if (tierValue) return tierValue;

  // Backward-compat: GROQ_MODEL lama hanya dipakai untuk tier "main" dan HANYA
  // bila isinya bukan model yang sudah dihentikan.
  const legacy = readEnv(env, "GROQ_MODEL");
  if (tier === "main" && legacy && !isDeprecatedGroqModel(legacy)) return legacy;

  return tier === "main" ? GROQ_MODEL_MAIN_DEFAULT : GROQ_MODEL_LIGHT_DEFAULT;
}

/** Tebak tier dari id model (dipakai hanya untuk menentukan reasoning effort). */
export function inferTierFromModel(model: string): AiModelTier {
  const id = model.trim().toLowerCase();
  return id.includes("120b") || id.includes("70b") ? "main" : "light";
}

export function resolveOpenRouterModel(env: EnvLike = process.env): string {
  return readEnv(env, "OPENROUTER_MODEL") || OPENROUTER_MODEL_DEFAULT;
}

/**
 * Model reasoning (gpt-oss/qwen3/minimax) menerima parameter `reasoning_effort`.
 * Model non-reasoning (mis. llama) menolak parameter itu → cukup dikirim bila
 * model memang mendukungnya.
 */
export function supportsReasoningEffort(model: string): boolean {
  const id = model.trim().toLowerCase();
  return id.includes("gpt-oss") || id.includes("qwen3") || id.includes("minimax");
}

/**
 * Reasoning effort default: tugas ringan → "low" (hemat token & latensi),
 * tugas berat (script) → "medium". Bisa dipaksa lewat env GROQ_REASONING_EFFORT.
 * `null` = jangan kirim parameter.
 */
export function resolveReasoningEffort(
  tier: AiModelTier,
  env: EnvLike = process.env
): AiReasoningEffort | null {
  const override = readEnv(env, "GROQ_REASONING_EFFORT").toLowerCase();
  if (override === "low" || override === "medium" || override === "high") return override;
  if (override) return null; // nilai tak dikenal → jangan kirim parameter
  return tier === "main" ? "medium" : "low";
}

/** API key Groq: "primary" = GROQ_API_KEY, "secondary" = GROQ_API_KEY2 (kuota terpisah). */
export function resolveGroqApiKey(
  source: GroqKeySource = "primary",
  env: EnvLike = process.env
): string | undefined {
  const value = readEnv(env, source === "secondary" ? "GROQ_API_KEY2" : "GROQ_API_KEY");
  return value || undefined;
}

/** Fallback OpenRouter bisa dimatikan lewat AI_FALLBACK_ENABLED=false (default aktif). */
export function isFallbackEnabled(env: EnvLike = process.env): boolean {
  return readEnv(env, "AI_FALLBACK_ENABLED").toLowerCase() !== "false";
}

/** Timeout per provider (env opsional: AI_GROQ_TIMEOUT_MS / AI_OPENROUTER_TIMEOUT_MS). */
export function resolveTimeoutMs(
  provider: "groq" | "openrouter",
  env: EnvLike = process.env
): number {
  const key = provider === "groq" ? "AI_GROQ_TIMEOUT_MS" : "AI_OPENROUTER_TIMEOUT_MS";
  const parsed = parseInt(readEnv(env, key), 10);
  if (Number.isFinite(parsed) && parsed >= 1000) return parsed;
  return AI_TIMEOUT_MS[provider];
}
