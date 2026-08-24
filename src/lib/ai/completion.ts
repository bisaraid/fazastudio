/**
 * AI Completion Router — ACS Standalone
 *
 * Primary: Groq (cepat & murah)
 * Fallback: OpenRouter (jika diaktifkan & key tersedia)
 */

import { groqCompletion, GroqCompletionParams, GroqCompletionResult } from "./groq";
import { openrouterCompletion, OpenRouterCompletionParams, OpenRouterCompletionResult } from "./openrouter";

export interface AiCompletionParams {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  temperature?: number;
  signal?: AbortSignal;
}

export interface AiCompletionResult {
  content: string;
  finish_reason: "stop" | "length";
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const FALLBACK_ENABLED = process.env.AI_FALLBACK_ENABLED !== "false";

export async function aiCompletion(params: AiCompletionParams): Promise<AiCompletionResult> {
  try {
    const result = await groqCompletion(params as GroqCompletionParams);
    console.log(`[AI] ✅ Groq success (model: ${params.model})`);
    return result;
  } catch (groqError) {
    if (groqError instanceof DOMException && groqError.name === "AbortError") {
      throw groqError;
    }

    const groqMsg = groqError instanceof Error ? groqError.message : String(groqError);
    console.warn(`[AI] ❌ Groq gagal: ${groqMsg}`);

    if (!FALLBACK_ENABLED || !process.env.OPENROUTER_API_KEY) {
      console.warn("[AI] Fallback ke OpenRouter tidak tersedia");
      throw groqError;
    }

    console.log(`[AI] 🔄 Fallback ke OpenRouter (model: ${OPENROUTER_MODEL})...`);
    try {
      const result = await openrouterCompletion({
        model: OPENROUTER_MODEL,
        messages: params.messages,
        max_tokens: params.max_tokens,
        response_format: params.response_format,
        temperature: params.temperature,
        signal: params.signal,
      } as OpenRouterCompletionParams);

      console.log(`[AI] ✅ OpenRouter success (model: ${OPENROUTER_MODEL})`);
      return result;
    } catch (orError) {
      if (orError instanceof DOMException && orError.name === "AbortError") {
        throw orError;
      }
      console.error("[AI] ❌ OpenRouter juga gagal:", orError);
      throw orError;
    }
  }
}