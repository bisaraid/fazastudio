/**
 * Groq AI Completion — transport HTTP langsung (tanpa SDK).
 *
 * Tanggung jawab file ini HANYA transport: bangun body, kirim, klasifikasikan
 * error. Pemilihan model (env) + fallback ke OpenRouter ada di `completion.ts`.
 *
 * Model (per 1 Okt 2026): `llama-3.3-70b-versatile` & `llama-3.1-8b-instant`
 * sudah dihentikan Groq (16 Agu 2026) → default dari `models.ts`
 * (openai/gpt-oss-120b & openai/gpt-oss-20b). Model gpt-oss adalah model
 * reasoning: token "berpikir" ikut memakai jatah output, sehingga `max_tokens`
 * pemanggil sengaja dinaikkan.
 */

import {
  AiProviderError,
  classifyAiFailure,
  extractProviderErrorInfo,
  truncateForLog,
} from "./errors";
import { fetchWithTimeout } from "./http";
import {
  inferTierFromModel,
  resolveGroqApiKey,
  resolveGroqModel,
  resolveReasoningEffort,
  resolveTimeoutMs,
  supportsReasoningEffort,
  type AiModelTier,
  type AiReasoningEffort,
  type GroqKeySource,
} from "./models";

const GROQ_API_BASE = "https://api.groq.com/openai/v1";

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqCompletionParams {
  /** Model eksplisit; kosong → env (GROQ_MODEL_MAIN/LIGHT) sesuai `tier`. */
  model?: string;
  tier?: AiModelTier;
  messages: GroqMessage[];
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  temperature?: number;
  signal?: AbortSignal;
  /** "primary" = GROQ_API_KEY (default); "secondary" = GROQ_API_KEY2 (kuota terpisah). */
  apiKeySource?: GroqKeySource;
  /** Reasoning effort paksa; `null` = jangan kirim parameter. */
  reasoningEffort?: AiReasoningEffort | null;
  timeoutMs?: number;
}

export interface GroqCompletionResult {
  content: string;
  finish_reason: "stop" | "length";
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

/**
 * Bangun body `chat/completions` (fungsi murni → mudah diuji).
 * `reasoning_effort` HANYA ditambahkan untuk model reasoning
 * (gpt-oss/qwen3/minimax) agar model lain tidak menolak parameter (400).
 */
export function buildGroqRequestBody(input: {
  model: string;
  messages: GroqMessage[];
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  temperature?: number;
  reasoningEffort?: AiReasoningEffort | null;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    max_tokens: input.max_tokens ?? 4096,
    response_format: input.response_format ?? { type: "json_object" },
    temperature: input.temperature ?? 0.8,
  };
  if (input.reasoningEffort && supportsReasoningEffort(input.model)) {
    body.reasoning_effort = input.reasoningEffort;
  }
  return body;
}

/**
 * Fetch Groq dengan retry TERBATAS untuk 429 saja (default 1× retry, tunggu
 * maks 5 detik — `Retry-After` Groq bisa puluhan detik, terlalu lama untuk limit
 * 60 detik function Vercel). Masih 429 → dibiarkan, `completion.ts` pindah ke
 * OpenRouter.
 */
async function callGroqWithRetry(
  url: string,
  init: RequestInit,
  options: {
    timeoutMs: number;
    signal?: AbortSignal;
    maxRetries?: number;
    waitCapMs?: number;
  }
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 1;
  const waitCapMs = options.waitCapMs ?? 5000;
  let attempt = 0;

  for (;;) {
    const res = await fetchWithTimeout(url, init, {
      provider: "groq",
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });
    if (res.status !== 429 || attempt >= maxRetries) return res;

    attempt += 1;
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
    const waitMs = Math.min(
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000,
      waitCapMs
    );
    console.warn(`[Groq] 429 - retry ${attempt}/${maxRetries} setelah ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

function parseUsage(
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined
): GroqCompletionResult["usage"] {
  return {
    prompt_tokens: usage?.prompt_tokens ?? 0,
    completion_tokens: usage?.completion_tokens ?? 0,
    total_tokens: usage?.total_tokens ?? 0,
  };
}

export async function groqCompletion(
  params: GroqCompletionParams
): Promise<GroqCompletionResult> {
  const keySource: GroqKeySource = params.apiKeySource ?? "primary";
  const apiKey = resolveGroqApiKey(keySource);
  if (!apiKey) {
    const envName = keySource === "secondary" ? "GROQ_API_KEY2" : "GROQ_API_KEY";
    throw new AiProviderError("groq", `${envName} tidak ditemukan di environment variables`, {
      ...classifyAiFailure({ kind: "missing_key" }),
    });
  }

  const model = params.model?.trim() || resolveGroqModel(params.tier ?? "main");
  const tier = params.tier ?? inferTierFromModel(model);
  const reasoningEffort =
    params.reasoningEffort !== undefined ? params.reasoningEffort : resolveReasoningEffort(tier);
  const timeoutMs = params.timeoutMs ?? resolveTimeoutMs("groq");

  const body = buildGroqRequestBody({
    model,
    messages: params.messages,
    max_tokens: params.max_tokens,
    response_format: params.response_format,
    temperature: params.temperature,
    reasoningEffort,
  });

  const response = await callGroqWithRetry(
    `${GROQ_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    { timeoutMs, signal: params.signal }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const info = extractProviderErrorInfo(errorBody);
    const cls = classifyAiFailure({
      kind: "http",
      status: response.status,
      code: info.code,
      message: info.message,
    });
    console.error(
      `[Groq API] Error ${response.status} (model=${model}, code=${info.code ?? "-"}, reason=${cls.reason}): ${truncateForLog(errorBody)}`
    );
    throw new AiProviderError("groq", `Groq API gagal merespon (${response.status}).`, {
      status: response.status,
      code: info.code,
      detail: truncateForLog(errorBody),
      ...cls,
    });
  }

  let data: {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new AiProviderError("groq", "Respons Groq bukan JSON valid", {
      ...classifyAiFailure({ kind: "parse" }),
    });
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    // Model reasoning bisa menghabiskan jatah token untuk berpikir → content kosong.
    const finish = data?.choices?.[0]?.finish_reason;
    throw new AiProviderError(
      "groq",
      `Respons Groq kosong (finish_reason=${String(finish ?? "-")})`,
      { ...classifyAiFailure({ kind: "parse" }) }
    );
  }

  return {
    content,
    finish_reason: data?.choices?.[0]?.finish_reason === "length" ? "length" : "stop",
    usage: parseUsage(data?.usage),
    model,
  };
}
