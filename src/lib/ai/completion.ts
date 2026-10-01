/**
 * Router AI bersama untuk SEMUA fitur teks — Faza Studio
 *
 * Urutan provider: Groq (utama) → OpenRouter (cadangan).
 * Pindah ke cadangan bila Groq: 404 model_not_found, 429/kuota, 5xx, timeout,
 * error jaringan, key bermasalah, atau hasil bukan JSON valid saat JSON wajib.
 * Setiap perpindahan diberi log jelas (fitur, model, status, alasan, tujuan)
 * supaya bisa dipantau di log Vercel. API key TIDAK pernah dicetak.
 *
 * Semua fitur teks (script, caption/generate-posting, ide, terjemahan,
 * klasifikasi topik) WAJIB lewat fungsi ini — jangan memanggil provider langsung.
 */

import { AiAllProvidersFailedError, AiProviderError, type AiAttempt } from "./errors";
import { groqCompletion } from "./groq";
import { openrouterCompletion } from "./openrouter";
import { parseJsonLoose } from "./json";
import {
  inferTierFromModel,
  isFallbackEnabled,
  resolveGroqModel,
  resolveOpenRouterModel,
  type AiModelTier,
  type GroqKeySource,
} from "./models";

export interface AiCompletionParams {
  /** Model eksplisit (mis. uji fallback / model eksperimen). Kosong → env sesuai tier. */
  model?: string;
  /** "main" (script) | "light" (caption, ide, terjemahan, klasifikasi). */
  tier?: AiModelTier;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  temperature?: number;
  signal?: AbortSignal;
  /** true → content WAJIB JSON valid; JSON rusak memicu fallback ke cadangan. */
  json?: boolean;
  /** Sumber key Groq: "primary" (default) atau "secondary" (GROQ_API_KEY2). */
  groqApiKeySource?: GroqKeySource;
  timeoutMs?: number;
  /** Nama fitur untuk log (mis. "caption", "script", "ideas", "topic-extractor"). */
  feature?: string;
}

export interface AiCompletionResult {
  content: string;
  finish_reason: "stop" | "length";
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** Provider yang akhirnya dipakai. */
  provider: "groq" | "openrouter";
  model: string;
  /** true bila hasil datang dari provider cadangan (OpenRouter). */
  fallback: boolean;
  latencyMs: number;
}

/** Dibatalkan pemanggil (bukan kegagalan provider) → jangan fallback. */
export function isCallerAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (!!error && typeof error === "object" && (error as { name?: string }).name === "AbortError")
  );
}

function failureInfo(error: unknown): {
  reason: AiAttempt["reason"];
  status?: number;
  code?: string;
} {
  if (error instanceof AiProviderError) {
    return { reason: error.reason, status: error.status, code: error.code };
  }
  return { reason: "none" };
}

/** Error transport yang sudah diklasifikasi memutuskan; error lain dianggap layak dicoba. */
export function shouldFailover(error: unknown, signal?: AbortSignal): boolean {
  if (isCallerAbort(error, signal)) return false;
  if (error instanceof AiProviderError) return error.failover;
  return true;
}

/** Validasi JSON (bila diminta). Mengembalikan alasan kegagalan atau null bila OK. */
function jsonProblem(content: string, requireJson?: boolean): string | null {
  if (!requireJson) return null;
  return parseJsonLoose(content) ? null : "JSON tidak valid / kosong";
}

/**
 * Panggil AI dengan urutan Groq → OpenRouter.
 * Hasil: `AiCompletionResult` (provider + model + fallback + latency) atau lempar
 * `AiAllProvidersFailedError` bila keduanya gagal.
 */
export async function aiCompletion(params: AiCompletionParams): Promise<AiCompletionResult> {
  const tier: AiModelTier = params.tier ?? (params.model ? inferTierFromModel(params.model) : "main");
  const feature = params.feature ?? "text";
  const groqModel = params.model?.trim() || resolveGroqModel(tier);
  const openrouterModel = resolveOpenRouterModel();
  const attempts: AiAttempt[] = [];

  // ================= 1) GROQ (utama) =================
  const groqStarted = Date.now();
  try {
    const result = await groqCompletion({
      model: groqModel,
      tier,
      messages: params.messages,
      max_tokens: params.max_tokens,
      response_format: params.response_format,
      temperature: params.temperature,
      signal: params.signal,
      apiKeySource: params.groqApiKeySource,
      timeoutMs: params.timeoutMs,
    });

    const problem = jsonProblem(result.content, params.json);
    if (problem) {
      // JSON rusak = pemicu fallback resmi (bukan error fatal).
      throw new AiProviderError("groq", `Groq mengembalikan ${problem}`, {
        reason: "bad_json",
        failover: true,
        detail: result.content.slice(0, 200),
      });
    }

    const latencyMs = Date.now() - groqStarted;
    console.log(
      `[AI] ✅ Groq ok (feature=${feature}, tier=${tier}, model=${groqModel}, ${latencyMs}ms, finish=${result.finish_reason}, tokens=${result.usage.total_tokens})`
    );
    return { ...result, provider: "groq", fallback: false, latencyMs };
  } catch (groqError) {
    if (isCallerAbort(groqError, params.signal)) {
      console.warn(`[AI] ⏹️ Dibatalkan pemanggil (feature=${feature}) — tanpa fallback`);
      throw groqError;
    }

    const fail = failureInfo(groqError);
    const statusText = fail.status ? `status=${fail.status}` : "tanpa status";
    const message = groqError instanceof Error ? groqError.message : String(groqError);
    attempts.push({
      provider: "groq",
      model: groqModel,
      status: fail.status,
      code: fail.code,
      reason: fail.reason,
      message,
    });

    if (!shouldFailover(groqError, params.signal)) {
      // Mis. 400 (permintaan salah) → cadangan akan menolak hal yang sama.
      console.error(
        `[AI] ❌ Groq gagal tanpa fallback (feature=${feature}, model=${groqModel}, ${statusText}, reason=${fail.reason}, code=${fail.code ?? "-"}): ${message}`
      );
      throw groqError;
    }
    if (!isFallbackEnabled()) {
      console.warn(
        `[AI] ⚠️ Groq gagal (feature=${feature}, ${statusText}, reason=${fail.reason}) tetapi fallback DIMATIKAN (AI_FALLBACK_ENABLED=false)`
      );
      throw groqError;
    }
    if (!process.env.OPENROUTER_API_KEY) {
      console.warn(
        `[AI] ⚠️ Groq gagal (feature=${feature}, ${statusText}, reason=${fail.reason}) dan OPENROUTER_API_KEY kosong → tidak bisa pindah provider`
      );
      throw groqError;
    }

    console.warn(
      `[AI] 🔄 Fallback Groq→OpenRouter (feature=${feature}, model_gagal=${groqModel}, ${statusText}, reason=${fail.reason}, code=${fail.code ?? "-"}) → model=${openrouterModel}`
    );

    // ================= 2) OPENROUTER (cadangan) =================
    const orStarted = Date.now();
    try {
      const result = await openrouterCompletion({
        model: openrouterModel,
        messages: params.messages,
        max_tokens: params.max_tokens,
        response_format: params.response_format,
        temperature: params.temperature,
        signal: params.signal,
        timeoutMs: params.timeoutMs,
      });

      const problem = jsonProblem(result.content, params.json);
      if (problem) {
        throw new AiProviderError("openrouter", `OpenRouter mengembalikan ${problem}`, {
          reason: "bad_json",
          failover: true,
          detail: result.content.slice(0, 200),
        });
      }

      const latencyMs = Date.now() - orStarted;
      attempts.push({ provider: "openrouter", model: openrouterModel, reason: "ok" });
      console.log(
        `[AI] ✅ OpenRouter ok (fallback, feature=${feature}, model=${openrouterModel}, ${latencyMs}ms, finish=${result.finish_reason}, tokens=${result.usage.total_tokens})`
      );
      return { ...result, provider: "openrouter", fallback: true, latencyMs };
    } catch (orError) {
      if (isCallerAbort(orError, params.signal)) throw orError;

      const orFail = failureInfo(orError);
      const orMessage = orError instanceof Error ? orError.message : String(orError);
      attempts.push({
        provider: "openrouter",
        model: openrouterModel,
        status: orFail.status,
        code: orFail.code,
        reason: orFail.reason,
        message: orMessage,
      });
      console.error(
        `[AI] ❌ Semua provider gagal (feature=${feature}): groq=${fail.reason}${fail.status ? `(${fail.status})` : ""} → openrouter=${orFail.reason}${orFail.status ? `(${orFail.status})` : ""}`
      );
      throw new AiAllProvidersFailedError(attempts, orError);
    }
  }
}

