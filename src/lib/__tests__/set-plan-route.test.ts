import { test, expect, describe, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";

// ============================================================
// POST /api/admin/set-plan — regresi bug "User tidak ditemukan" (2026-09-30).
//
// Yang dijaga di sini:
//  1. email huruf besar/spasi/karakter tak terlihat → tetap ketemu,
//  2. user di halaman ke-2 (paginasi penuh) → tetap ketemu,
//  3. listUsers error → 500 `auth_lookup_failed` (BUKAN 404 palsu) + log,
//  4. email belum terdaftar → 404 `user_not_found` + pesan jelas + saran,
//  5. lookup sukses tapi tulis plan gagal → 500 `plan_write_failed` + kode
//     referensi log (detail teknis code/message/details/hint hanya di log,
//     ter-redaksi / tanpa PII).
// Semua I/O dimock (Auth + usage + audit) — tanpa jaringan/DB.
// ============================================================

interface FakeUser {
  id: string;
  email?: string | null;
}

const fake = vi.hoisted(() => ({
  planResult: true,
  planError: null as null | {
    code: string;
    message: string;
    details: string | null;
    hint: string | null;
  },
  setPlanCalls: [] as Array<[string, string]>,
  auditCalls: [] as Array<Record<string, unknown>>,
  listUserCalls: [] as Array<{ page: number; perPage: number }>,
  pages: [] as Array<Array<{ id: string; email?: string | null }>>,
  authError: null as string | null,
}));

vi.mock("@/app/api/admin/_auth", () => ({
  requireAdmin: async () => ({
    user: { id: "admin-1", email: "admin@example.com" },
    response: null,
  }),
}));

vi.mock("@/lib/usage", () => ({
  // Route memakai varian DETIL agar penyebab kegagalan DB bisa dicatat.
  setPlanForUserDetailed: async (userId: string, plan: string) => {
    fake.setPlanCalls.push([userId, plan]);
    if (fake.planResult) return { ok: true, stage: "update", error: null };
    return { ok: false, stage: "insert", error: fake.planError };
  },
}));

vi.mock("@/lib/admin-audit", () => ({
  recordAudit: async (input: Record<string, unknown>) => {
    fake.auditCalls.push(input);
    return true;
  },
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    auth: {
      admin: {
        listUsers: async (params: { page: number; perPage: number }) => {
          fake.listUserCalls.push(params);
          if (fake.authError) return { data: null, error: { message: fake.authError } };
          return { data: { users: fake.pages[params.page - 1] ?? [] }, error: null };
        },
      },
    },
  }),
}));

import { POST } from "@/app/api/admin/set-plan/route";

/** Data nyata yang dipakai di test: userId + email user terdaftar. */
const USER_ID = "cffd1283-e3c4-49d8-ad34-2e6b6109e93d";
const USER_EMAIL = "akunjobside@gmail.com";

/** Request minimal — route hanya memakai request.json(). */
const req = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;

function fullPage(n: number, prefix: string): FakeUser[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    email: `${prefix}${i}@example.com`,
  }));
}

beforeEach(() => {
  fake.planResult = true;
  fake.planError = null;
  fake.setPlanCalls = [];
  fake.auditCalls = [];
  fake.listUserCalls = [];
  fake.pages = [];
  fake.authError = null;
});

describe("POST /api/admin/set-plan — cari user via email", () => {
  test("email huruf besar + spasi → 200 & plan di-set untuk userId yang benar", async () => {
    // Bentuk data nyata: auth.users berisi email polos lowercase.
    fake.pages = [
      [
        { id: "cffd1283-e3c4-49d8-ad34-2e6b6109e93d", email: "akunjobside@gmail.com" },
        { id: "3643b10b-5f9b-46a8-8504-8118686fe004", email: "mama@gmail.com" },
      ],
    ];

    const res = await POST(req({ email: "  AKUNJOBSIDE@Gmail.com ", plan: "starter" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.plan).toBe("starter");
    expect(fake.setPlanCalls).toEqual([
      ["cffd1283-e3c4-49d8-ad34-2e6b6109e93d", "starter"],
    ]);
    expect(fake.auditCalls[0].subjectUserId).toBe("cffd1283-e3c4-49d8-ad34-2e6b6109e93d");
  });

  test("user di halaman ke-2 tetap diaktifkan (bukan 404)", async () => {
    fake.pages = [
      fullPage(1000, "lama"),
      [{ id: "u-1001", email: "jauh@example.com" }],
    ];

    const res = await POST(req({ email: "jauh@example.com", plan: "pro" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(fake.listUserCalls).toEqual([
      { page: 1, perPage: 1000 },
      { page: 2, perPage: 1000 },
    ]);
    expect(fake.setPlanCalls).toEqual([["u-1001", "pro"]]);
  });

  test("listUsers error → 500 auth_lookup_failed (BUKAN 404) + penyebab di-log", async () => {
    fake.authError = "Invalid API key";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await POST(req({ email: "benar@example.com", plan: "starter" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe("auth_lookup_failed");
    expect(json.error).not.toMatch(/tidak ditemukan/i);
    expect(fake.setPlanCalls).toHaveLength(0);
    expect(
      warn.mock.calls.some((c) => String(c[1] ?? "").includes("Invalid API key"))
    ).toBe(true);
    warn.mockRestore();
  });

  test("email belum terdaftar → 404 'belum terdaftar' + saran mirip, tanpa audit", async () => {
    fake.pages = [[{ id: "u-1", email: "budi.santoso@example.com" }]];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await POST(req({ email: "budi.santoso@example.co", plan: "starter" }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("user_not_found");
    expect(json.error).toContain("belum terdaftar");
    expect(json.error).toContain("budi.santoso@example.com");
    expect(json.suggestions).toEqual(["budi.santoso@example.com"]);
    expect(fake.setPlanCalls).toHaveLength(0);
    expect(fake.auditCalls).toHaveLength(0);
    warn.mockRestore();
  });

  test("plan tidak valid → 400 invalid_plan tanpa menyentuh Auth API", async () => {
    const res = await POST(req({ email: "a@example.com", plan: "gold" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("invalid_plan");
    expect(fake.listUserCalls).toHaveLength(0);
    expect(fake.setPlanCalls).toHaveLength(0);
  });

  test("lookup sukses tapi tulis plan gagal → 500 plan_write_failed + ref, detail hanya di log", async () => {
    fake.planResult = false;
    fake.planError = {
      code: "23502",
      message:
        'null value in column "identity_key" of relation "user_usage" violates not-null constraint',
      details: `Failing row contains (${USER_ID}, null, 2026-09).`,
      hint: `jalankan migration 028; pemilik ${USER_EMAIL}`,
    };
    fake.pages = [[{ id: USER_ID, email: USER_EMAIL }]];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await POST(req({ email: USER_EMAIL, plan: "starter" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.code).toBe("plan_write_failed");
    expect(fake.setPlanCalls).toEqual([[USER_ID, "starter"]]);
    expect(fake.auditCalls).toHaveLength(0);

    // Klien hanya menerima kode referensi — TANPA detail internal.
    expect(json.ref).toMatch(/^sp-[a-z0-9]{8}$/);
    expect(json.error).toContain(json.ref);
    expect(json.error).toContain("Gagal menyimpan plan ke database");
    expect(json.error).not.toContain("23502");
    expect(json.error).not.toContain("identity_key");
    expect(json.error).not.toContain("user_usage");

    // Penyebab lengkap (code/message/details/hint) ada di log, sudah ter-redaksi.
    const log = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(log).toContain("plan_write_failed");
    expect(log).toContain(`ref=${json.ref}`);
    expect(log).toContain("stage=insert");
    expect(log).toContain("code=23502");
    expect(log).toContain("message=null value in column");
    expect(log).toContain("details=Failing row contains ([uuid]");
    expect(log).toContain("hint=jalankan migration 028");
    expect(log).not.toContain(USER_ID);
    expect(log).not.toContain(USER_EMAIL);
    warn.mockRestore();
  });

  test("userId dari halaman Users tetap didukung & di-trim (tanpa lookup email)", async () => {
    const res = await POST(req({ userId: "  u-9 ", plan: "pro" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(fake.setPlanCalls).toEqual([["u-9", "pro"]]);
    expect(fake.listUserCalls).toHaveLength(0);
  });

  test("tanpa userId & tanpa email → 404 tanpa memanggil Auth API", async () => {
    const res = await POST(req({ plan: "pro" }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("user_not_found");
    expect(fake.listUserCalls).toHaveLength(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
