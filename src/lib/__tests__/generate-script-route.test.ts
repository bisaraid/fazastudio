import { test, expect, describe, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

// ============================================================
// 5C — POST /api/generate-script (mock total, tanpa jaringan/DB/LLM):
//  1. PROJECT_LIMIT (409) dicek SEBELUM debet & SEBELUM panggilan AI,
//  2. persist script gagal SETELAH debit "charged" → refundScriptDebit
//     dipanggil (kredit tidak hangus),
//  3. regresi Fase 4A: engine AI gagal setelah debet → refund juga jalan,
//  4. jalur sukses → 200 tanpa refund.
// ============================================================

const mocks = vi.hoisted(() => {
  const state = {
    currentUser: null as null | { id: string },
    projRow: null as null | {
      script: string | null;
      audio_url: string | null;
      video_url: string | null;
    },
    persistError: null as null | { message: string },
    categoryRow: null as null | { id: string },
  };

  // Builder tiruan Supabase: select().eq().maybeSingle() / update().eq()
  // (await → { error }) / insert() / single().
  function builder(table: string) {
    const b: any = {
      _op: "",
      select: () => b,
      eq: () => b,
      update: () => {
        b._op = "update";
        return b;
      },
      insert: () => Promise.resolve({ error: null }),
      maybeSingle: () =>
        Promise.resolve({ data: table === "projects" ? state.projRow : null, error: null }),
      single: () =>
        Promise.resolve({
          data: table === "content_categories" ? state.categoryRow : null,
          error: null,
        }),
      then: (onFulfilled: any, onRejected: any) => {
        const result = b._op === "update" ? { error: state.persistError } : { error: null };
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    return b;
  }

  return {
    state,
    validateApiKey: vi.fn(),
    checkRateLimit: vi.fn(),
    getServerIdentity: vi.fn(),
    decrementCredit: vi.fn(),
    decrementCreditForUser: vi.fn(),
    checkCredits: vi.fn(),
    getUsageForUser: vi.fn(),
    refundScriptDebit: vi.fn(),
    generateScriptWithAI: vi.fn(),
    requireProjectOwnership: vi.fn(),
    countContentProjects: vi.fn(),
    oldestContentProject: vi.fn(),
    createServiceRoleClient: () => ({ from: builder }),
  };
});

vi.mock("@/lib/api-auth", () => ({ validateApiKey: mocks.validateApiKey }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: () => "1.2.3.4",
  buildBurstKey: (scope: string, ip: string, tag: string) => `${tag}:${scope}:${ip}`,
}));
vi.mock("@/lib/identity", () => ({
  getServerIdentity: mocks.getServerIdentity,
  deviceCookieOptions: () => ({ path: "/", maxAge: 31536000, sameSite: "lax" as const }),
  DEVICE_ID_COOKIE: "device_id",
}));
vi.mock("@/lib/supabase/ssr", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.state.currentUser } }) },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/usage", () => ({
  decrementCredit: mocks.decrementCredit,
  decrementCreditForUser: mocks.decrementCreditForUser,
  checkCredits: mocks.checkCredits,
  getUsageForUser: mocks.getUsageForUser,
}));
vi.mock("@/lib/credit-refund", () => ({ refundScriptDebit: mocks.refundScriptDebit }));
vi.mock("@/lib/script-generator", () => ({ generateScriptWithAI: mocks.generateScriptWithAI }));
vi.mock("@/lib/project-ownership", () => ({
  requireProjectOwnership: mocks.requireProjectOwnership,
}));
vi.mock("@/lib/project-media", () => ({
  countContentProjects: mocks.countContentProjects,
  oldestContentProject: mocks.oldestContentProject,
}));

import { POST } from "@/app/api/generate-script/route";
import { MAX_FREE_CONTENT_PROJECTS } from "@/lib/constants";

const req = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const BODY = { topic: "tips belajar", categoryId: "edukasi", duration: "60", projectId: "p-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.currentUser = null;
  mocks.state.projRow = { script: null, audio_url: null, video_url: null };
  mocks.state.persistError = null;
  mocks.state.categoryRow = { id: "cat-1" };
  mocks.validateApiKey.mockReturnValue({ valid: true, isSameOrigin: true });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, resetInSeconds: 60, remaining: 9 });
  mocks.getServerIdentity.mockReturnValue({
    deviceId: "dev-1",
    identityKey: "anon:dev-1",
    isNew: false,
  });
  mocks.decrementCredit.mockResolvedValue({ status: "charged", period: "2026-09" });
  mocks.decrementCreditForUser.mockResolvedValue({ status: "charged", period: "2026-09" });
  mocks.checkCredits.mockResolvedValue(true);
  mocks.getUsageForUser.mockResolvedValue({ plan: "free", creditsRemaining: 5 });
  mocks.refundScriptDebit.mockResolvedValue(null);
  mocks.generateScriptWithAI.mockResolvedValue({
    id: "s1",
    title: "t",
    scenes: [],
    fullScript: "f",
    estimatedDuration: 5,
    wordCount: 1,
    usedClosingIds: [],
  });
  mocks.requireProjectOwnership.mockResolvedValue(true);
  mocks.countContentProjects.mockResolvedValue(0);
  mocks.oldestContentProject.mockResolvedValue(null);
});

describe("5C — PROJECT_LIMIT sebelum debet & sebelum AI", () => {
  test("mentok batas project → 409 SEBELUM debet/panggilan LLM", async () => {
    mocks.countContentProjects.mockResolvedValue(MAX_FREE_CONTENT_PROJECTS);

    const res = await POST(req(BODY));

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("PROJECT_LIMIT");
    expect(mocks.decrementCredit).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.generateScriptWithAI).not.toHaveBeenCalled();
    expect(mocks.refundScriptDebit).not.toHaveBeenCalled();
  });

  test("ownership 404 juga di awal — tanpa debet & tanpa AI", async () => {
    mocks.requireProjectOwnership.mockResolvedValue(false);

    const res = await POST(req(BODY));

    expect(res.status).toBe(404);
    expect(mocks.decrementCredit).not.toHaveBeenCalled();
    expect(mocks.generateScriptWithAI).not.toHaveBeenCalled();
  });
});

describe("5C — refund saat persist script gagal setelah charged", () => {
  test("persist projects gagal → refundScriptDebit dipanggil, lalu 500", async () => {
    mocks.state.persistError = { message: "db down" };

    const res = await POST(req(BODY));

    expect(res.status).toBe(500);
    expect(mocks.decrementCredit).toHaveBeenCalledTimes(1);
    expect(mocks.generateScriptWithAI).toHaveBeenCalledTimes(1);
    expect(mocks.refundScriptDebit).toHaveBeenCalledTimes(1);
    const arg = mocks.refundScriptDebit.mock.calls[0][0];
    expect(arg.charge).toEqual({ status: "charged", period: "2026-09" });
    expect(arg.projectId).toBe("p-1");
    expect(arg.identityKey).toBe("anon:dev-1");
    expect(arg.reason).toBe("persist script ke projects gagal");
    expect(arg.requestId).toBeTruthy(); // kunci idempotensi per-request
  });

  test("regresi 4A: engine AI gagal setelah debet → refund juga jalan", async () => {
    mocks.generateScriptWithAI.mockRejectedValue(new Error("LLM down"));

    const res = await POST(req(BODY));

    expect(res.status).toBe(500);
    expect(mocks.refundScriptDebit).toHaveBeenCalledTimes(1);
    expect(mocks.refundScriptDebit.mock.calls[0][0].reason).toBe("generateScriptWithAI gagal");
  });

  test("jalur sukses → 200 TANPA refund", async () => {
    const res = await POST(req(BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("s1");
    expect(mocks.refundScriptDebit).not.toHaveBeenCalled();
    expect(mocks.decrementCredit).toHaveBeenCalledTimes(1);
  });
});