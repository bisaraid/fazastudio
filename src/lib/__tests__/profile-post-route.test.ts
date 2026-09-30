import { test, expect, describe, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

// ============================================================
// POST /api/profile — POST bersifat PATCH (hanya field yang dikirim).
//
// Regresi yang dijaga (penyebab user terpental ke /mulai berulang):
// Sebelumnya SEMUA kolom persona ditulis `body.x ?? null`, sehingga body
// parsial (mis. hanya fullName/genreTags) MENGHAPUS hasil onboarding user.
// Gate middleware lalu menganggap user "belum onboarding" → redirect ke
// /mulai terus-menerus, sementara wizard tampak sukses ("Profil kamu siap!").
//
// Semua I/O dimock (sesi cookie + service-role) — tanpa jaringan/DB.
// ============================================================

const fake = vi.hoisted(() => ({
  sessionUserId: "user-1" as string | null,
  currentRow: null as Record<string, unknown> | null,
  selectError: null as { message: string } | null,
  upsertError: null as { message: string } | null,
  upserts: [] as Array<{ patch: Record<string, unknown>; options: unknown }>,
  selectCols: [] as string[],
  tables: [] as string[],
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
  createServiceRoleClient: () => ({
    from: (table: string) => {
      fake.tables.push(table);
      return {
        select: (cols: string) => {
          fake.selectCols.push(cols);
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: fake.currentRow, error: fake.selectError }),
            }),
          };
        },
        upsert: async (patch: Record<string, unknown>, options: unknown) => {
          fake.upserts.push({ patch, options });
          return { error: fake.upsertError };
        },
      };
    },
  }),
}));

import { POST } from "@/app/api/profile/route";

/** Request minimal — route hanya memakai request.json(). */
const req = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;

const COMPLETE_ROW = {
  layer1_mode: "konten",
  niche_slug: "mistis",
  gaya_key: "pendongeng-pelan",
  cerita_key: "bangun-suasana",
};

beforeEach(() => {
  fake.sessionUserId = "user-1";
  fake.currentRow = null;
  fake.selectError = null;
  fake.upsertError = null;
  fake.upserts = [];
  fake.selectCols = [];
  fake.tables = [];
});

describe("POST /api/profile — body parsial tidak boleh menghapus persona", () => {
  test("hanya fullName → kolom persona TIDAK ikut ditulis", async () => {
    fake.currentRow = COMPLETE_ROW;

    const res = await POST(req({ fullName: "Budi" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(fake.upserts).toHaveLength(1);

    const patch = fake.upserts[0].patch;
    expect(patch.full_name).toBe("Budi");
    expect("layer1_mode" in patch).toBe(false);
    expect("niche_slug" in patch).toBe(false);
    expect("gaya_key" in patch).toBe(false);
    expect("cerita_key" in patch).toBe(false);
    expect("has_completed_onboarding" in patch).toBe(false);
    // Tidak ada persona yang dikirim → tidak perlu query baris lama.
    expect(fake.selectCols).toEqual([]);
    // Baris lama tetap utuh di DB (patch tidak menyentuhnya).
    expect(fake.currentRow).toEqual(COMPLETE_ROW);
  });

  test("body kosong → hanya user_id + updated_at yang ditulis", async () => {
    await POST(req({}));

    const patch = fake.upserts[0].patch;
    expect(Object.keys(patch).sort()).toEqual(["updated_at", "user_id"]);
  });

  test("hanya genreTags → genre_tags ditulis, persona tidak tersentuh", async () => {
    await POST(req({ genreTags: ["horor"] }));

    const patch = fake.upserts[0].patch;
    expect(patch.genre_tags).toEqual(["horor"]);
    expect("layer1_mode" in patch).toBe(false);
    expect("cerita_key" in patch).toBe(false);
  });
});


describe("POST /api/profile — has_completed_onboarding jujur", () => {
  test("persona lengkap (baru) → 4 kolom ditulis & flag true", async () => {
    const res = await POST(
      req({
        layer1Mode: "konten",
        nicheSlug: "mistis",
        gayaKey: "pendongeng-pelan",
        ceritaKey: "bangun-suasana",
      })
    );
    const body = await res.json();

    const patch = fake.upserts[0].patch;
    expect(patch.layer1_mode).toBe("konten");
    expect(patch.niche_slug).toBe("mistis");
    expect(patch.gaya_key).toBe("pendongeng-pelan");
    expect(patch.cerita_key).toBe("bangun-suasana");
    expect(patch.has_completed_onboarding).toBe(true);
    expect(body.data.has_completed_onboarding).toBe(true);
  });

  test("persona tidak lengkap (gaya kosong) → kolom jadi null & flag false", async () => {
    await POST(req({ layer1Mode: "konten", nicheSlug: "mistis", gayaKey: "", ceritaKey: "x" }));

    const patch = fake.upserts[0].patch;
    expect(patch.gaya_key).toBeNull();
    expect(patch.has_completed_onboarding).toBe(false);
  });

  test("melengkapi HANYA cerita di atas baris lama → flag true, kolom lain tidak ditimpa", async () => {
    fake.currentRow = {
      layer1_mode: "konten",
      niche_slug: "mistis",
      gaya_key: "pendongeng-pelan",
      cerita_key: null,
    };

    await POST(req({ ceritaKey: "bangun-suasana" }));

    const patch = fake.upserts[0].patch;
    expect(patch.cerita_key).toBe("bangun-suasana");
    expect("layer1_mode" in patch).toBe(false);
    expect("niche_slug" in patch).toBe(false);
    expect(patch.has_completed_onboarding).toBe(true);
    expect(fake.selectCols[0]).toContain("cerita_key");
  });

  test("baris lama belum lengkap & patch tidak melengkapi → flag false", async () => {
    fake.currentRow = { layer1_mode: null, niche_slug: null, gaya_key: null, cerita_key: null };

    await POST(req({ layer1Mode: "jualan" }));

    expect(fake.upserts[0].patch.has_completed_onboarding).toBe(false);
  });

  test("id selalu dari sesi + upsert memakai onConflict user_id", async () => {
    fake.sessionUserId = "user-lain";

    await POST(req({ layer1Mode: "konten" }));

    expect(fake.tables.every((t) => t === "profiles")).toBe(true);
    expect(fake.upserts[0].patch.user_id).toBe("user-lain");
    expect(fake.upserts[0].options).toEqual({ onConflict: "user_id" });
  });
});

describe("POST /api/profile — jalur gagal terlihat", () => {
  test("upsert error → 500 + success false + tidak ada data", async () => {
    fake.upsertError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req({ layer1Mode: "konten" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Gagal menyimpan profil");
    expect(body.data).toBeUndefined();
    spy.mockRestore();
  });

  test("belum login → 401 dan service-role tidak pernah dipanggil", async () => {
    fake.sessionUserId = null;

    const res = await POST(req({ layer1Mode: "konten" }));

    expect(res.status).toBe(401);
    expect(fake.upserts).toEqual([]);
    expect(fake.tables).toEqual([]);
  });
});
