import { test, expect, describe, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

// ============================================================
// 5D — gate login endpoint mahal (mock total, tanpa jaringan):
//  - /api/generate-subtitle (Whisper) → anon 401 sebelum cek kredit/ownership
//  - /api/generate-tts non-preview    → anon 401 sebelum metering
//  - /api/generate-tts preview        → anon TETAP dilayani (guard preview)
//  - /api/generate-video (render)     → anon 401 sebelum enqueue
// ============================================================

const mocks = vi.hoisted(() => ({
  currentUser: null as null | { id: string },
  validateApiKey: vi.fn(),
  checkRateLimit: vi.fn(),
  getServerIdentity: vi.fn(),
  checkCredits: vi.fn(),
  checkCreditsForUser: vi.fn(),
  getUsage: vi.fn(),
  getUsageForUser: vi.fn(),
  isPreviewUsed: vi.fn(),
  markPreviewUsed: vi.fn(),
  requireProjectOwnership: vi.fn(),
  addRenderJob: vi.fn(),
  getRenderQueue: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ validateApiKey: mocks.validateApiKey }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: () => "1.2.3.4",
  buildBurstKey: (scope: string, ip: string, tag: string) => `${tag}:${scope}:${ip}`,
}));
vi.mock("@/lib/identity", () => ({
  getServerIdentity: mocks.getServerIdentity,
  buildDeviceCookieHeader: (id: string) =>
    `device_id=${id}; Path=/; Max-Age=31536000; SameSite=Lax`,
  deviceCookieOptions: () => ({ path: "/", maxAge: 31536000, sameSite: "lax" as const }),
  DEVICE_ID_COOKIE: "device_id",
}));
vi.mock("@/lib/supabase/ssr", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: mocks.currentUser } }) },
  }),
}));
// Gate bekerja SEBELUM semua akses DB — kalau ada yang tersentuh, test gagal.
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      throw new Error("gate terlewat — request anon tidak boleh menyentuh DB");
    },
  }),
}));
vi.mock("@/lib/usage", () => ({
  checkCredits: mocks.checkCredits,
  checkCreditsForUser: mocks.checkCreditsForUser,
  getUsage: mocks.getUsage,
  getUsageForUser: mocks.getUsageForUser,
}));
vi.mock("@/lib/preview-guard", () => ({
  isPreviewUsed: mocks.isPreviewUsed,
  markPreviewUsed: mocks.markPreviewUsed,
}));
vi.mock("@/lib/project-ownership", () => ({
  requireProjectOwnership: mocks.requireProjectOwnership,
}));
vi.mock("@/lib/signed-storage-url", () => ({
  resolveMediaUrl: vi.fn(),
  getSignedStorageUrl: vi.fn(),
}));
vi.mock("../../../worker/src/queue", () => ({
  addRenderJob: mocks.addRenderJob,
  getRenderQueue: mocks.getRenderQueue,
}));

import { POST as subtitlePOST } from "@/app/api/generate-subtitle/route";
import { POST as ttsPOST } from "@/app/api/generate-tts/route";
import { POST as videoPOST } from "@/app/api/generate-video/route";

const req = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser = null;
  mocks.validateApiKey.mockReturnValue({ valid: true, isSameOrigin: true });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, resetInSeconds: 60, remaining: 9 });
  mocks.getServerIdentity.mockReturnValue({
    deviceId: "dev-1",
    identityKey: "anon:dev-1",
    isNew: false,
  });
  mocks.checkCredits.mockResolvedValue(true);
  mocks.checkCreditsForUser.mockResolvedValue(true);
  mocks.getUsage.mockResolvedValue({ plan: "free", creditsRemaining: 5 });
  mocks.getUsageForUser.mockResolvedValue({ plan: "free", creditsRemaining: 5 });
  mocks.isPreviewUsed.mockResolvedValue(false);
  mocks.requireProjectOwnership.mockResolvedValue(true);
  mocks.addRenderJob.mockResolvedValue("render:p-1:1");
});

describe("POST /api/generate-subtitle (5D)", () => {
  test("anon → 401 AUTH_REQUIRED sebelum cek kredit & ownership", async () => {
    const res = await subtitlePOST(req({ audioUrl: "acs-audio/x.mp3", projectId: "p-1" }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe("AUTH_REQUIRED");
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.requireProjectOwnership).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });
});

describe("POST /api/generate-tts (5D)", () => {
  test("non-preview anon → 401 sebelum metering (getUsage tidak dipanggil)", async () => {
    const res = await ttsPOST(
      req({
        scenes: [{ narration: "halo dunia" }],
        provider: "google",
        settings: {},
        preview: false,
        projectId: "p-1",
      })
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe("AUTH_REQUIRED");
    expect(mocks.getUsage).not.toHaveBeenCalled();
    expect(mocks.getUsageForUser).not.toHaveBeenCalled();
  });

  test("preview anon → TETAP dilayani sampai guard preview (429, bukan 401)", async () => {
    mocks.isPreviewUsed.mockResolvedValue(true);

    const res = await ttsPOST(
      req({
        scenes: [{ narration: "halo dunia" }],
        provider: "cartesia",
        settings: {},
        preview: true,
      })
    );

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe("PREVIEW_USED");
    expect(res.status).not.toBe(401);
  });
});

describe("POST /api/generate-video (5D)", () => {
  test("anon → 401 sebelum enqueue job render & sebelum ownership", async () => {
    const res = await videoPOST(
      req({
        audioUrl: "acs-audio/a.mp3",
        subtitleUrl: "acs-subtitle/s.vtt",
        projectId: "p-1",
      })
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe("AUTH_REQUIRED");
    expect(mocks.addRenderJob).not.toHaveBeenCalled();
    expect(mocks.requireProjectOwnership).not.toHaveBeenCalled();
  });
});