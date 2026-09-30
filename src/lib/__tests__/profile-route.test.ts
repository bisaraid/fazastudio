import { test, expect, describe, beforeEach, vi } from "vitest";

// ============================================================
// GET /api/profile — hanya mengembalikan profil (termasuk flag
// `is_admin`) milik user yang sedang login.
//
// Flag ini dipakai klien HANYA untuk menampilkan link "Panel Admin";
// otorisasi tetap di server (`requireAdmin` di /api/admin/*). Karena
// filter query selalu `user_id = id sesi`, status admin akun lain
// tidak pernah ikut terkirim.
//
// Semua I/O dimock (sesi cookie + service-role) — tanpa jaringan/DB.
// ============================================================

const fake = vi.hoisted(() => ({
  sessionUserId: "user-own" as string | null,
  profileRow: null as Record<string, unknown> | null,
  profileError: null as { message: string } | null,
  fromTables: [] as string[],
  selectCols: [] as string[],
  eqCalls: [] as Array<[string, unknown]>,
  serviceClientCalls: 0,
}));

vi.mock("@/lib/supabase/ssr", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: fake.sessionUserId
            ? { id: fake.sessionUserId, email: "me@example.com" }
            : null,
        },
      }),
    },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => {
    fake.serviceClientCalls += 1;
    return {
      from: (table: string) => {
        fake.fromTables.push(table);
        return {
          select: (cols: string) => {
            fake.selectCols.push(cols);
            return {
              eq: (col: string, val: unknown) => {
                fake.eqCalls.push([col, val]);
                return {
                  maybeSingle: async () => ({
                    data: fake.profileRow,
                    error: fake.profileError,
                  }),
                };
              },
            };
          },
        };
      },
    };
  },
}));

import { GET } from "@/app/api/profile/route";

beforeEach(() => {
  fake.sessionUserId = "user-own";
  fake.profileRow = { user_id: "user-own", full_name: "Budi", is_admin: false };
  fake.profileError = null;
  fake.fromTables = [];
  fake.selectCols = [];
  fake.eqCalls = [];
  fake.serviceClientCalls = 0;
});

describe("GET /api/profile — is_admin milik sendiri", () => {
  test("admin → is_admin true (boolean) & kolomnya benar-benar di-select", async () => {
    fake.profileRow = { user_id: "user-own", full_name: "Budi", is_admin: true };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.is_admin).toBe(true);
    expect(fake.selectCols).toHaveLength(1);
    expect(fake.selectCols[0]).toContain("is_admin");
  });

  test("non-admin → is_admin false", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.is_admin).toBe(false);
  });

  test("hanya baris user login: tabel profiles + satu filter user_id = id sesi", async () => {
    await GET();

    expect(fake.fromTables).toEqual(["profiles"]);
    expect(fake.eqCalls).toEqual([["user_id", "user-own"]]);
  });

  test("id selalu berasal dari sesi aktif, bukan dari input lain", async () => {
    fake.sessionUserId = "user-lain";
    fake.profileRow = { user_id: "user-lain", is_admin: true };

    const body = await (await GET()).json();

    expect(fake.eqCalls).toEqual([["user_id", "user-lain"]]);
    expect(body.data.user_id).toBe("user-lain");
  });

  test("nilai aneh (null / string) di-coerce ke false — hanya true asli lolos", async () => {
    fake.profileRow = { user_id: "user-own", is_admin: null };
    expect((await (await GET()).json()).data.is_admin).toBe(false);

    fake.profileRow = { user_id: "user-own", is_admin: "true" };
    expect((await (await GET()).json()).data.is_admin).toBe(false);
  });

  test("belum login → 401 & service-role tidak pernah dipanggil (tanpa bocoran flag)", async () => {
    fake.sessionUserId = null;

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(fake.serviceClientCalls).toBe(0);
    expect(fake.selectCols).toEqual([]);
  });

  test("profil belum ada → data null", async () => {
    fake.profileRow = null;

    const body = await (await GET()).json();

    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  test("error DB → 500 tanpa data", async () => {
    fake.profileError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.data).toBeUndefined();
    spy.mockRestore();
  });
});
