/**
 * Groq AI Completion — ACS Standalone
 *
 * Implements direct HTTP call to Groq API (no SDK dependency).
 * Pattern inspired by viraloop implementation, but self-contained for ACS.
 *
 * Includes retry + backoff for 429 (rate limit) — reads Retry-After header.
 */

const GROQ_API_BASE = "https://api.groq.com/openai/v1";

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqCompletionParams {
  model: string;
  messages: GroqMessage[];
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  temperature?: number;
  signal?: AbortSignal;
}

export interface GroqCompletionResult {
  content: string;
  finish_reason: "stop" | "length";
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Fetch Groq dengan retry + backoff untuk status 429 (rate limit).
 * Membaca header `Retry-After` (default 15 detik) lalu menunggu sebelum retry.
 */
async function callGroqWithRetry(
  url: string,
  init: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, init);

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "15", 10);
      const safeRetry = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 15;
      console.warn(`[Groq] 429 - retry ${i + 1}/${maxRetries} after ${safeRetry}s`);
      await new Promise((r) => setTimeout(r, safeRetry * 1000));
      continue;
    }

    return res;
  }

  throw new Error("Groq max retries exceeded");
}

export async function groqCompletion(
  params: GroqCompletionParams
): Promise<GroqCompletionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY tidak ditemukan di environment variables");
  }

  const model = params.model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const response = await callGroqWithRetry(`${GROQ_API_BASE}/chat/completions`, {
    method: "POST",
    signal: params.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      max_tokens: params.max_tokens ?? 4096,
      response_format: params.response_format ?? { type: "json_object" },
      temperature: params.temperature ?? 0.8,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Groq API] Error ${response.status}:`, errorBody);
    throw new Error(
      `Groq API gagal merespon (${response.status}). Silakan coba lagi.`
    );
  }

  const data = await response.json();

  return {
    content: data.choices[0].message.content,
    finish_reason: data.choices[0].finish_reason,
    usage: {
      prompt_tokens: data.usage.prompt_tokens,
      completion_tokens: data.usage.completion_tokens,
      total_tokens: data.usage.total_tokens,
    },
  };
}