/**
 * OpenRouter AI Completion — provider CADANGAN untuk semua fitur teks.
 *
 * Dipakai otomatis oleh `src/lib/ai/completion.ts` hanya bila Groq gagal
 * (404 model_not_found, 429/kuota, 5xx, timeout, JSON rusak, key bermasalah).
 * Model default: `openai/gpt-4o-mini` (≈$0.15 / 1M input, $0.60 / 1M output).
 */

import {
  AiProviderError,
  classifyAiFailure,
  extractProviderErrorInfo,
  truncateForLog,
} from "./errors";
import { fetchWithTimeout } from "./http";
import { resolveTimeoutMs } from "./models";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterCompletionParams {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface OpenRouterCompletionResult {
  content: string;
  finish_reason: "stop" | "length";
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

/** Sebagian model mengembalikan content sebagai array bagian teks → digabung. */
export function normalizeOpenRouterContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .filter((p) => p.length > 0);
    return parts.length > 0 ? parts.join("") : null;
  }
  return null;
}

export async function openrouterCompletion(
  params: OpenRouterCompletionParams
): Promise<OpenRouterCompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AiProviderError("openrouter", "OPENROUTER_API_KEY tidak ditemukan di environment variables", {
      ...classifyAiFailure({ kind: "missing_key" }),
    });
  }

  const timeoutMs = params.timeoutMs ?? resolveTimeoutMs("openrouter");
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    max_tokens: params.max_tokens ?? 4096,
    temperature: params.temperature ?? 0.7,
  };
  // Hanya JSON mode yang dikirim eksplisit; `{ type: "text" }` adalah default
  // (sebagian provider OpenRouter menolak field itu) sehingga lebih aman dihilangkan.
  if (params.response_format && params.response_format.type === "json_object") {
    body.response_format = params.response_format;
  }

  const response = await fetchWithTimeout(
    `${OPENROUTER_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Faza Studio",
      },
      body: JSON.stringify(body),
    },
    { provider: "openrouter", timeoutMs, signal: params.signal }
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
      `[OpenRouter API] Error ${response.status} (model=${params.model}, code=${info.code ?? "-"}, reason=${cls.reason}): ${truncateForLog(errorBody)}`
    );
    throw new AiProviderError("openrouter", `OpenRouter API gagal merespon (${response.status}).`, {
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
    throw new AiProviderError("openrouter", "Respons OpenRouter bukan JSON valid", {
      ...classifyAiFailure({ kind: "parse" }),
    });
  }

  const content = normalizeOpenRouterContent(data?.choices?.[0]?.message?.content);
  if (!content || content.trim() === "") {
    const finish = data?.choices?.[0]?.finish_reason;
    throw new AiProviderError(
      "openrouter",
      `Respons OpenRouter kosong (finish_reason=${String(finish ?? "-")})`,
      { ...classifyAiFailure({ kind: "parse" }) }
    );
  }

  return {
    content,
    finish_reason: data?.choices?.[0]?.finish_reason === "length" ? "length" : "stop",
    usage: {
      prompt_tokens: data?.usage?.prompt_tokens ?? 0,
      completion_tokens: data?.usage?.completion_tokens ?? 0,
      total_tokens: data?.usage?.total_tokens ?? 0,
    },
    model: params.model,
  };
}
