import { test, expect, describe, beforeEach, afterEach, vi } from "vitest";

// ============================================================
// Jalur AI bersama (Groq → OpenRouter) — 6 bagian:
//  1. Pemilihan model/env (models.ts) dengan default valid + legacy deprecation
//  2. Klasifikasi kegagalan & alasan fallback (errors.ts)
//  3. Parser JSON longgar (json.ts) — termasuk teks "pemikiran" bocor
//  4. Body request Groq (buildGroqRequestBody) + normalisasi konten OpenRouter
//  5. Failover nyata di aiCompletion (fetch di-stub, tanpa jaringan nyata):
//     404 model_not_found, 429, JSON rusak, key hilang, dan kedua provider gagal
//  6. Pemetaan error ke respons user (503 jelas, bukan 500 generik)
// ============================================================

import {
  GROQ_MODEL_MAIN_DEFAULT,
  GROQ_MODEL_LIGHT_DEFAULT,
  OPENROUTER_MODEL_DEFAULT,
  AI_TIMEOUT_MS,
  isDeprecatedGroqModel,
  isFallbackEnabled,
  resolveGroqApiKey,
  resolveGroqModel,
  resolveOpenRouterModel,
  resolveReasoningEffort,
  resolveTimeoutMs,
  supportsReasoningEffort,
  type AiModelTier,
} from "@/lib/ai/models";
import { buildGroqRequestBody } from "@/lib/ai/groq";
import { normalizeOpenRouterContent } from "@/lib/ai/openrouter";
import {
  AiAllProvidersFailedError,
  AiProviderError,
  classifyAiFailure,
  extractProviderErrorInfo,
  toUserFacingAiError,
  truncateForLog,
} from "@/lib/ai/errors";
import { cleanLlmContent, parseJsonArrayLoose, parseJsonLoose } from "@/lib/ai/json";
import { aiCompletion } from "@/lib/ai/completion";

// ---------- util env & fetch (tanpa jaringan) ----------

const AI_ENV_KEYS = [
  "GROQ_API_KEY",
  "GROQ_API_KEY2",
  "GROQ_MODEL",
  "GROQ_MODEL_MAIN",
  "GROQ_MODEL_LIGHT",
  "GROQ_REASONING_EFFORT",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "AI_FALLBACK_ENABLED",
  "AI_GROQ_TIMEOUT_MS",
  "AI_OPENROUTER_TIMEOUT_MS",
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of AI_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of AI_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface StubCall {
  url: string;
  body: Record<string, unknown> | undefined;
  headers: Record<string, string>;
}

/** Stub `global.fetch` dan catat url/body/header setiap panggilan. */
function stubFetch(handler: (call: StubCall, index: number) => Response) {
  const calls: StubCall[] = [];
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? "");
    let body: Record<string, unknown> | undefined;
    try {
      body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    } catch {
      body = undefined;
    }
    const call: StubCall = { url, body, headers: (init?.headers ?? {}) as Record<string, string> };
    calls.push(call);
    return handler(call, calls.length - 1);
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function completionResponse(content: string, finish: "stop" | "length" = "stop"): Response {
  return jsonResponse({
    choices: [{ message: { content }, finish_reason: finish }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
  });
}

/** Body error ala Groq untuk model_not_found (sesuai log produksi). */
function groqModelNotFoundBody(model = "llama-3.3-70b-versatile"): string {
  return JSON.stringify({
    error: {
      message: `The model \`${model}\` does not exist or you do not have access to it.`,
      type: "invalid_request_error",
      code: "model_not_found",
    },
  });
}

// ============================================================
// 1) Pemilihan model & env
// ============================================================

describe("pemilihan model Groq per tier", () => {
  test("tanpa env → default produksi (pengganti model yang dihentikan 16 Agu 2026)", () => {
    expect(resolveGroqModel("main", {})).toBe(GROQ_MODEL_MAIN_DEFAULT);
    expect(resolveGroqModel("light", {})).toBe(GROQ_MODEL_LIGHT_DEFAULT);
    expect(GROQ_MODEL_MAIN_DEFAULT).toBe("openai/gpt-oss-120b");
    expect(GROQ_MODEL_LIGHT_DEFAULT).toBe("openai/gpt-oss-20b");
  });

  test("env tier menang atas default", () => {
    expect(resolveGroqModel("main", { GROQ_MODEL_MAIN: " custom/main " })).toBe("custom/main");
    expect(resolveGroqModel("light", { GROQ_MODEL_LIGHT: "custom/light" })).toBe("custom/light");
  });

  test("GROQ_MODEL legacy dipakai untuk main hanya bila modelnya masih valid", () => {
    expect(resolveGroqModel("main", { GROQ_MODEL: "openai/gpt-oss-120b" })).toBe(
      "openai/gpt-oss-120b"
    );
    // Nilai lama yang sudah dihentikan → DIABAIKAN (akar error 404 model_not_found).
    expect(resolveGroqModel("main", { GROQ_MODEL: "llama-3.3-70b-versatile" })).toBe(
      GROQ_MODEL_MAIN_DEFAULT
    );
    // Legacy tidak pernah dipakai untuk tier light (kuota/limit terpisah).
    expect(resolveGroqModel("light", { GROQ_MODEL: "openai/gpt-oss-120b" })).toBe(
      GROQ_MODEL_LIGHT_DEFAULT
    );
  });

  test("env tier tetap menang walau GROQ_MODEL legacy berisi model valid", () => {
    const env = { GROQ_MODEL: "openai/gpt-oss-120b", GROQ_MODEL_MAIN: "openai/gpt-oss-20b" };
    expect(resolveGroqModel("main", env)).toBe("openai/gpt-oss-20b");
  });

  test("daftar model deprecated Groq dikenali (versi-versi lama)", () => {
    expect(isDeprecatedGroqModel("llama-3.3-70b-versatile")).toBe(true);
    expect(isDeprecatedGroqModel("llama-3.1-8b-instant")).toBe(true);
    expect(isDeprecatedGroqModel("llama-3.1-70b-specdec")).toBe(true);
    expect(isDeprecatedGroqModel("mixtral-8x7b-32768")).toBe(true);
    expect(isDeprecatedGroqModel("gemma2-9b-it")).toBe(true);
    expect(isDeprecatedGroqModel("openai/gpt-oss-120b")).toBe(false);
    expect(isDeprecatedGroqModel("openai/gpt-oss-20b")).toBe(false);
    expect(isDeprecatedGroqModel("")).toBe(false);
  });

  test("model OpenRouter cadangan punya default murah & bisa di-override", () => {
    expect(resolveOpenRouterModel({})).toBe(OPENROUTER_MODEL_DEFAULT);
    expect(OPENROUTER_MODEL_DEFAULT).toBe("openai/gpt-4o-mini");
    expect(resolveOpenRouterModel({ OPENROUTER_MODEL: "google/gemini-2.5-flash-lite" })).toBe(
      "google/gemini-2.5-flash-lite"
    );
  });

  test("reasoning effort: main=medium, light=low, bisa dipaksa, nilai aneh → null", () => {
    expect(resolveReasoningEffort("main", {})).toBe("medium");
    expect(resolveReasoningEffort("light", {})).toBe("low");
    expect(resolveReasoningEffort("light", { GROQ_REASONING_EFFORT: "HIGH" })).toBe("high");
    expect(resolveReasoningEffort("main", { GROQ_REASONING_EFFORT: "turbo" })).toBeNull();
    expect(supportsReasoningEffort("openai/gpt-oss-120b")).toBe(true);
    expect(supportsReasoningEffort("qwen/qwen3.8-27b")).toBe(true);
    expect(supportsReasoningEffort("llama-3.3-70b-versatile")).toBe(false);
  });

  test("key Groq primary/secondary + flag fallback + timeout", () => {
    expect(resolveGroqApiKey("primary", { GROQ_API_KEY: "k1" })).toBe("k1");
    expect(resolveGroqApiKey("secondary", { GROQ_API_KEY2: "k2" })).toBe("k2");
    expect(resolveGroqApiKey("primary", {})).toBeUndefined();

    expect(isFallbackEnabled({})).toBe(true);
    expect(isFallbackEnabled({ AI_FALLBACK_ENABLED: "false" })).toBe(false);
    expect(isFallbackEnabled({ AI_FALLBACK_ENABLED: "true" })).toBe(true);

    expect(resolveTimeoutMs("groq", {})).toBe(AI_TIMEOUT_MS.groq);
    expect(resolveTimeoutMs("openrouter", {})).toBe(AI_TIMEOUT_MS.openrouter);
    expect(resolveTimeoutMs("groq", { AI_GROQ_TIMEOUT_MS: "2500" })).toBe(2500);
    expect(resolveTimeoutMs("groq", { AI_GROQ_TIMEOUT_MS: "abc" })).toBe(AI_TIMEOUT_MS.groq);
  });
});

// ============================================================
// 2) Klasifikasi kegagalan provider
// ============================================================

describe("classifyAiFailure", () => {
  test("404 / model_not_found → fallback (kasus produksi hari ini)", () => {
    expect(classifyAiFailure({ kind: "http", status: 404 })).toEqual({
      reason: "model_not_found",
      failover: true,
    });
    expect(classifyAiFailure({ kind: "http", code: "model_not_found" }).failover).toBe(true);
    expect(
      classifyAiFailure({
        kind: "http",
        status: 400,
        message:
          "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it",
      }).reason
    ).toBe("model_not_found");
  });

  test("429 / kuota / 5xx / timeout / jaringan / key → fallback", () => {
    expect(classifyAiFailure({ kind: "http", status: 429 })).toEqual({
      reason: "rate_limit",
      failover: true,
    });
    expect(classifyAiFailure({ kind: "http", code: "rate_limit_exceeded" }).reason).toBe(
      "rate_limit"
    );
    expect(classifyAiFailure({ kind: "http", status: 402 }).reason).toBe("quota");
    expect(classifyAiFailure({ kind: "http", code: "insufficient_quota" }).reason).toBe("quota");
    expect(classifyAiFailure({ kind: "http", status: 500 }).reason).toBe("server_error");
    expect(classifyAiFailure({ kind: "http", status: 503 }).reason).toBe("server_error");
    expect(classifyAiFailure({ kind: "http", status: 504 }).reason).toBe("timeout");
    expect(classifyAiFailure({ kind: "timeout" }).reason).toBe("timeout");
    expect(classifyAiFailure({ kind: "network" }).reason).toBe("network");
    expect(classifyAiFailure({ kind: "missing_key" }).reason).toBe("missing_key");
    expect(classifyAiFailure({ kind: "parse" }).reason).toBe("bad_json");
    expect(classifyAiFailure({ kind: "http", status: 401 }).reason).toBe("auth");
    expect(classifyAiFailure({ kind: "http", status: 403 }).reason).toBe("auth");
  });

  test("400/413/422 (permintaan salah) TIDAK memicu fallback", () => {
    expect(classifyAiFailure({ kind: "http", status: 400 })).toEqual({
      reason: "none",
      failover: false,
    });
    expect(classifyAiFailure({ kind: "http", status: 413 }).failover).toBe(false);
    expect(classifyAiFailure({ kind: "http", status: 422 }).failover).toBe(false);
    // Pesan "model not found" pada status 5xx tidak boleh dibaca sebagai model hilang.
    expect(
      classifyAiFailure({ kind: "http", status: 500, message: "upstream model not found" }).reason
    ).toBe("server_error");
  });

  test("extractProviderErrorInfo membaca body Groq/OpenRouter & non-JSON", () => {
    expect(extractProviderErrorInfo(groqModelNotFoundBody())).toEqual({
      code: "model_not_found",
      message:
        "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.",
    });
    expect(extractProviderErrorInfo('{"error":{"type":"rate_limit_exceeded"}}').code).toBe(
      "rate_limit_exceeded"
    );
    expect(extractProviderErrorInfo("<html>502</html>").message).toContain("502");
    expect(extractProviderErrorInfo("")).toEqual({});
    expect(truncateForLog("abcdef", 3)).toBe("abc…");
  });
});

// ============================================================
// 3) Parser JSON longgar (model reasoning bisa "bocor" ke content)
// ============================================================

describe("parseJsonLoose / parseJsonArrayLoose", () => {
  test("JSON murni, code-fence, dan prosa di sekitarnya", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Berikut hasilnya:\n{"a":1}\nSemoga membantu')).toEqual({ a: 1 });
  });

  test("blok pemikiran yang bocor diabaikan saat parsing", () => {
    const withThinking =
      "<thinking>user minta JSON, saya susun dulu</thinking>\n{\"optimizedTitle\":\"X\"}";
    expect(parseJsonLoose(withThinking)).toEqual({ optimizedTitle: "X" });
    expect(cleanLlmContent(withThinking)).toBe('{"optimizedTitle":"X"}');
  });

  test("teks tidak valid → null (bukan objek kosong palsu)", () => {
    expect(parseJsonLoose("")).toBeNull();
    expect(parseJsonLoose("maaf saya tidak bisa")).toBeNull();
    expect(parseJsonLoose("[1,2,3]")).toBeNull(); // array bukan objek
  });

  test("array longgar: array murni, dibungkus objek, atau code-fence", () => {
    expect(parseJsonArrayLoose('["a","b"]')).toEqual(["a", "b"]);
    expect(parseJsonArrayLoose('{"ideas":["a","b"]}')).toEqual(["a", "b"]);
    expect(parseJsonArrayLoose('```json\n{"ideas":["a"]}\n```')).toEqual(["a"]);
    expect(parseJsonArrayLoose('{"n":1}')).toBeNull();
    expect(parseJsonArrayLoose("bukan json")).toBeNull();
  });
});

// ============================================================
// 4) Body Groq & normalisasi konten OpenRouter
// ============================================================

describe("buildGroqRequestBody", () => {
  const messages = [{ role: "user" as const, content: "halo" }];

  test("default: max_tokens/temperature/response_format JSON + reasoning_effort gpt-oss", () => {
    const body = buildGroqRequestBody({
      model: "openai/gpt-oss-20b",
      messages,
      reasoningEffort: "low",
    });
    expect(body).toMatchObject({
      model: "openai/gpt-oss-20b",
      messages,
      max_tokens: 4096,
      temperature: 0.8,
      response_format: { type: "json_object" },
      reasoning_effort: "low",
    });
  });

  test("model non-reasoning tidak dikirimi reasoning_effort (hindari 400)", () => {
    const body = buildGroqRequestBody({
      model: "llama-3.3-70b-versatile",
      messages,
      reasoningEffort: "low",
    });
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  test("response_format text & max_tokens dari pemanggil dihormati", () => {
    const body = buildGroqRequestBody({
      model: "openai/gpt-oss-120b",
      messages,
      max_tokens: 2048,
      response_format: { type: "text" },
      temperature: 0.5,
      reasoningEffort: null,
    });
    expect(body.max_tokens).toBe(2048);
    expect(body.response_format).toEqual({ type: "text" });
    expect(body.temperature).toBe(0.5);
    expect(body).not.toHaveProperty("reasoning_effort");
  });
});

describe("normalizeOpenRouterContent", () => {
  test("string langsung, array bagian teks, dan nilai tak terpakai", () => {
    expect(normalizeOpenRouterContent("hi")).toBe("hi");
    expect(normalizeOpenRouterContent([{ text: "a" }, "b", { type: "image" }])).toBe("ab");
    expect(normalizeOpenRouterContent(null)).toBeNull();
    expect(normalizeOpenRouterContent([])).toBeNull();
  });
});

// ============================================================
// 5) Failover nyata di aiCompletion (fetch di-stub, tanpa jaringan)
// ============================================================

describe("aiCompletion — Groq → OpenRouter", () => {
  const baseParams = {
    tier: "light" as AiModelTier,
    feature: "caption",
    messages: [{ role: "user" as const, content: "buat caption" }],
    json: true,
  };

  function groq404(): Response {
    return new Response(groqModelNotFoundBody(), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  function warnText(): string {
    return vi
      .mocked(console.warn)
      .mock.calls.map((args) => String(args[0] ?? ""))
      .join("\n");
  }

  test("Groq sukses → provider groq, tanpa panggilan cadangan", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const { calls } = stubFetch(() => completionResponse('{"optimizedTitle":"Judul"}'));

    const res = await aiCompletion(baseParams);

    expect(res.provider).toBe("groq");
    expect(res.fallback).toBe(false);
    expect(res.model).toBe(GROQ_MODEL_LIGHT_DEFAULT);
    expect(res.content).toContain("optimizedTitle");
    expect(res.usage.total_tokens).toBe(18);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.groq.com");
    expect(calls[0].body?.model).toBe(GROQ_MODEL_LIGHT_DEFAULT);
    expect(calls[0].body?.reasoning_effort).toBe("low"); // gpt-oss + tugas ringan
    expect(calls[0].headers.Authorization).toBe("Bearer groq-key");
  });

  test("404 model_not_found Groq → pindah OpenRouter + log alasan", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const { calls } = stubFetch((call) =>
      call.url.includes("api.groq.com") ? groq404() : completionResponse('{"ok":true}')
    );

    const res = await aiCompletion({ ...baseParams, model: "llama-3.3-70b-versatile" });

    expect(res.provider).toBe("openrouter");
    expect(res.fallback).toBe(true);
    expect(res.model).toBe(OPENROUTER_MODEL_DEFAULT);
    expect(
      calls.map((c) => (c.url.includes("api.groq.com") ? "groq" : "openrouter"))
    ).toEqual(["groq", "openrouter"]);
    expect(calls[1].body?.model).toBe(OPENROUTER_MODEL_DEFAULT);
    expect(calls[1].headers.Authorization).toBe("Bearer or-key");

    const logs = warnText();
    expect(logs).toContain("Fallback Groq→OpenRouter");
    expect(logs).toContain("model_not_found");
    expect(logs).toContain("status=404");
  });

  test("JSON rusak dari Groq (HTTP 200) → tetap pindah OpenRouter", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const { calls } = stubFetch((call) =>
      call.url.includes("api.groq.com")
        ? completionResponse("Maaf, saya tidak bisa memenuhi permintaan itu.")
        : completionResponse('{"caption":"siap posting"}')
    );

    const res = await aiCompletion(baseParams);

    expect(res.provider).toBe("openrouter");
    expect(res.content).toContain("siap posting");
    expect(calls).toHaveLength(2);
    expect(warnText()).toContain("bad_json");
  });

  test("json tidak diwajibkan → teks bebas tetap diterima dari Groq", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const { calls } = stubFetch(() => completionResponse("outline bebas, bukan JSON"));

    const res = await aiCompletion({ ...baseParams, json: false, response_format: { type: "text" } });

    expect(res.provider).toBe("groq");
    expect(res.content).toBe("outline bebas, bukan JSON");
    expect(calls).toHaveLength(1);
  });

  test("jalur cadangan: response_format 'text' tidak dikirim ke OpenRouter", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const { calls } = stubFetch((call) =>
      call.url.includes("api.groq.com")
        ? new Response(groqModelNotFoundBody(), { status: 404 })
        : completionResponse("outline via cadangan")
    );

    const res = await aiCompletion({
      ...baseParams,
      json: false,
      response_format: { type: "text" },
    });

    expect(res.provider).toBe("openrouter");
    expect(calls[1].body).not.toHaveProperty("response_format");
  });
});

describe("aiCompletion — batas & kegagalan", () => {
  const baseParams = {
    tier: "light" as AiModelTier,
    feature: "ideas",
    messages: [{ role: "user" as const, content: "ide konten" }],
    json: true,
  };

  test("429 (rate limit) → 1× retry lalu pindah OpenRouter", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const { calls } = stubFetch((call) =>
      call.url.includes("api.groq.com")
        ? new Response('{"error":{"code":"rate_limit_exceeded"}}', {
            status: 429,
            headers: { "content-type": "application/json", "retry-after": "1" },
          })
        : completionResponse('{"ideas":["a"]}')
    );

    // Timer palsu: jeda retry 1 detik (Retry-After) tidak menahan test.
    vi.useFakeTimers();
    const pending = aiCompletion(baseParams);
    await vi.advanceTimersByTimeAsync(1500);
    const res = await pending;

    expect(res.provider).toBe("openrouter");
    expect(res.fallback).toBe(true);
    expect(calls.map((c) => (c.url.includes("api.groq.com") ? "groq" : "openrouter"))).toEqual([
      "groq",
      "groq",
      "openrouter",
    ]);
  });

  test("kedua provider gagal → AiAllProvidersFailedError (bukan error mentah)", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const { calls } = stubFetch((call) =>
      call.url.includes("api.groq.com")
        ? new Response(groqModelNotFoundBody(), { status: 404 })
        : new Response('{"error":{"message":"upstream down"}}', { status: 502 })
    );

    const error = await aiCompletion(baseParams).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiAllProvidersFailedError);
    const err = error as AiAllProvidersFailedError;
    expect(err.status).toBe(503);
    expect(err.code).toBe("AI_UNAVAILABLE");
    expect(err.attempts.map((a) => a.provider)).toEqual(["groq", "openrouter"]);
    expect(err.attempts[0].reason).toBe("model_not_found");
    expect(err.attempts[1].reason).toBe("server_error");
    expect(calls).toHaveLength(2);

    // Di route: dipetakan ke 503 + pesan jelas, bukan 500 "Internal server error".
    expect(toUserFacingAiError(err)).toEqual({
      status: 503,
      code: "AI_UNAVAILABLE",
      message: expect.stringContaining("Layanan AI"),
    });
  });

  test("400 (permintaan salah) TIDAK pindah provider — gagal jelas", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const { calls } = stubFetch(
      () => new Response('{"error":{"message":"invalid request"}}', { status: 400 })
    );

    const error = await aiCompletion(baseParams).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiProviderError);
    const err = error as AiProviderError;
    expect(err.reason).toBe("none");
    expect(err.failover).toBe(false);
    expect(calls).toHaveLength(1); // cadangan tidak dipanggil
    expect(toUserFacingAiError(err)).toMatchObject({ status: 502, code: "AI_PROVIDER_ERROR" });
  });

  test("GROQ_API_KEY hilang → langsung pakai OpenRouter (missing_key)", async () => {
    process.env.OPENROUTER_API_KEY = "or-key";
    const { calls } = stubFetch(() => completionResponse('{"ideas":["a"]}'));

    const res = await aiCompletion(baseParams);

    expect(res.provider).toBe("openrouter");
    expect(res.fallback).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("openrouter.ai");
  });

  test("AI_FALLBACK_ENABLED=false → tidak pindah provider", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    process.env.AI_FALLBACK_ENABLED = "false";
    const { calls } = stubFetch(() => new Response(groqModelNotFoundBody(), { status: 404 }));

    const error = await aiCompletion(baseParams).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiProviderError);
    expect(calls).toHaveLength(1);
  });

  test("OPENROUTER_API_KEY kosong → tidak ada tujuan fallback", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    const { calls } = stubFetch(() => new Response("", { status: 500 }));

    const error = await aiCompletion(baseParams).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).reason).toBe("server_error");
    expect(calls).toHaveLength(1);
  });

  test("dibatalkan pemanggil (AbortError) → tidak dianggap kegagalan provider", async () => {
    process.env.GROQ_API_KEY = "groq-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const { calls } = stubFetch(() => {
      throw new DOMException("dibatalkan", "AbortError");
    });

    const error = await aiCompletion(baseParams).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DOMException);
    expect(calls).toHaveLength(1); // tidak pindah ke cadangan
    expect(toUserFacingAiError(error)).toBeNull();
  });

  test("key secondary (GROQ_API_KEY2) dipakai untuk klasifikasi topik", async () => {
    process.env.GROQ_API_KEY = "primary-key";
    process.env.GROQ_API_KEY2 = "secondary-key";
    process.env.OPENROUTER_API_KEY = "or-key";
    const { calls } = stubFetch(() => completionResponse('{"items":[]}'));

    const res = await aiCompletion({ ...baseParams, groqApiKeySource: "secondary" });

    expect(res.provider).toBe("groq");
    expect(calls[0].headers.Authorization).toBe("Bearer secondary-key");
  });
});

// ============================================================
// 6) Pemetaan error → respons user
// ============================================================

describe("toUserFacingAiError", () => {
  test("kedua provider gagal → 503 + pesan ramah (bukan 500 generik)", () => {
    const err = new AiAllProvidersFailedError([
      { provider: "groq", model: "openai/gpt-oss-120b", status: 404, reason: "model_not_found" },
      { provider: "openrouter", model: "openai/gpt-4o-mini", status: 429, reason: "rate_limit" },
    ]);
    expect(err.message).toContain("model_not_found");
    expect(toUserFacingAiError(err)).toEqual({
      status: 503,
      code: "AI_UNAVAILABLE",
      message: expect.stringContaining("semua provider gagal"),
    });
  });

  test("error provider yang bisa di-failover → 503; yang tidak → 502", () => {
    const failoverable = new AiProviderError("groq", "timeout", {
      reason: "timeout",
      failover: true,
    });
    const rejected = new AiProviderError("groq", "bad request", {
      status: 400,
      reason: "none",
      failover: false,
    });
    expect(toUserFacingAiError(failoverable)?.status).toBe(503);
    expect(toUserFacingAiError(rejected)?.status).toBe(502);
  });

  test("error non-AI → null (route tetap pakai penanganan 500 generik)", () => {
    expect(toUserFacingAiError(new Error("db connection refused"))).toBeNull();
    expect(toUserFacingAiError("string error")).toBeNull();
  });
});
