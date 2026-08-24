/**
 * OpenRouter AI Completion — ACS Standalone Fallback
 */

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
}

export interface OpenRouterCompletionResult {
  content: string;
  finish_reason: "stop" | "length";
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function openrouterCompletion(
  params: OpenRouterCompletionParams
): Promise<OpenRouterCompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY tidak ditemukan di environment variables");
  }

  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    signal: params.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "AutoContent Studio",
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      max_tokens: params.max_tokens ?? 4096,
      response_format: params.response_format,
      temperature: params.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[OpenRouter API] Error ${response.status}:`, errorBody);
    throw new Error(`OpenRouter API gagal merespon (${response.status}).`);
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