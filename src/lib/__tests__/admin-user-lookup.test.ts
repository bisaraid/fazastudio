import { test, expect, describe } from "vitest";
import {
  AUTH_PAGE_SIZE,
  AuthLookupError,
  MAX_SUGGESTIONS,
  findAuthUserByEmail,
  isSimilarText,
  normalizeEmail,
  type AuthUserLike,
} from "@/lib/admin-user-lookup";

// ============================================================
// src/lib/admin-user-lookup.ts — akar bug /admin/set-plan.
//
// Latar (diagnosa 2026-09-30 terhadap proyek ini): Auth admin listUsers
// SEHAT (HTTP 200, per_page=1000 diterima) dan hanya ada 5 user, semuanya
// email polos lowercase tanpa anomali. Artinya 404 "User tidak ditemukan"
// tidak mungkin berasal dari daftar yang bersih itu kecuali (a) panggilan
// Auth API gagal dan errornya DIBUNGKUS jadi "tidak ditemukan" oleh route
// lama, atau (b) string yang diketik berbeda dari yang tersimpan (typo /
// karakter tak terlihat hasil copy-paste / email belum terdaftar).
//
// Kedua kemungkinan itu diuji di sini:
//  - test paginasi & normalisasi → memastikan (b) tertangani,
//  - test AuthLookupError        → memastikan (a) TIDAK lagi jadi "tidak ada".
//
// `listPage` disuntikkan, jadi tidak ada jaringan/DB di test ini.
// ============================================================

/** Fake Auth API: pages[p-1] = halaman ke-p; merekam panggilan. */
function fakeAuth(pages: AuthUserLike[][]) {
  const calls: Array<{ page: number; perPage: number }> = [];
  const listPage = async ({ page, perPage }: { page: number; perPage: number }) => {
    calls.push({ page, perPage });
    return pages[page - 1] ?? [];
  };
  return { calls, listPage };
}

/** Halaman "penuh" berisi user dummy (default seukuran halaman Auth API). */
function fullPage(n: number, prefix: string): AuthUserLike[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    email: `${prefix}${i}@example.com`,
  }));
}

describe("normalizeEmail — trik copy-paste tidak boleh menggagalkan lookup", () => {
  test("huruf besar + spasi di tepi", () => {
    expect(normalizeEmail("  Budi@Example.COM ")).toBe("budi@example.com");
  });

  test("zero-width space (umum dari WhatsApp/PDF) dibuang", () => {
    expect(normalizeEmail("budi\u200b@example.com")).toBe("budi@example.com");
    expect(normalizeEmail("\ufeffbudi@example.com")).toBe("budi@example.com");
  });

  test("NBSP & spasi di tengah dibuang", () => {
    expect(normalizeEmail("budi@\u00a0example.com")).toBe("budi@example.com");
    expect(normalizeEmail("budi @example.com")).toBe("budi@example.com");
  });

  test("bentuk Unicode setara dinormalkan (NFKC)", () => {
    // Mis. titik penuh lebar (U+FF0E) hasil copy-paste.
    expect(normalizeEmail("budi\uff0e@example.com")).toBe("budi.@example.com");
  });

  test("null / undefined / kosong", () => {
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail("   ")).toBe("");
  });
});

describe("isSimilarText — heuristik typo (jarak edit ≤ 2)", () => {
  test("satu karakter hilang / salah / tertukar", () => {
    expect(isSimilarText("akunjobsid", "akunjobside")).toBe(true);
    expect(isSimilarText("budi", "budj")).toBe(true);
    expect(isSimilarText("budi", "bdui")).toBe(true);
  });

  test("mirip tapi berbeda jauh tidak dianggap typo", () => {
    expect(isSimilarText("budi", "budi.santoso")).toBe(false);
    expect(isSimilarText("xyz", "abd")).toBe(false);
  });

  test("identik selalu true", () => {
    expect(isSimilarText("budi", "budi")).toBe(true);
  });
});

describe("findAuthUserByEmail — pencarian user", () => {
  test("email huruf besar + spasi tetap ketemu (userId benar)", async () => {
    const auth = fakeAuth([[{ id: "u-1", email: "budi@example.com" }]]);

    const res = await findAuthUserByEmail(auth.listPage, "  BUDI@Example.COM ");

    expect(res.userId).toBe("u-1");
    expect(res.matchedEmail).toBe("budi@example.com");
    expect(res.scanned).toBe(1);
    expect(res.pages).toBe(1);
  });

  test("email dengan karakter tak terlihat tetap ketemu", async () => {
    const auth = fakeAuth([[{ id: "u-1", email: "budi@example.com" }]]);

    const res = await findAuthUserByEmail(auth.listPage, "budi\u200b@example.com");

    expect(res.userId).toBe("u-1");
  });

  test("user di halaman KEDUA tetap ketemu (paginasi penuh, bukan page 1 saja)", async () => {
    const auth = fakeAuth([
      fullPage(AUTH_PAGE_SIZE, "lama"),
      [{ id: "u-target", email: "target@example.com" }],
    ]);

    const res = await findAuthUserByEmail(auth.listPage, "target@example.com");

    expect(res.userId).toBe("u-target");
    expect(res.pages).toBe(2);
    expect(res.scanned).toBe(AUTH_PAGE_SIZE + 1);
    expect(auth.calls).toEqual([
      { page: 1, perPage: AUTH_PAGE_SIZE },
      { page: 2, perPage: AUTH_PAGE_SIZE },
    ]);
  });

  test("berhenti begitu ketemu — halaman berikutnya tidak dipanggil", async () => {
    const auth = fakeAuth([
      [{ id: "u-1", email: "cepat@example.com" }, ...fullPage(999, "lain")],
      [{ id: "u-2", email: "jangan-dipanggil@example.com" }],
    ]);

    const res = await findAuthUserByEmail(auth.listPage, "cepat@example.com");

    expect(res.userId).toBe("u-1");
    expect(res.scanned).toBe(1);
    expect(auth.calls).toHaveLength(1);
  });

  test("tidak ada di halaman mana pun → userId null (404 wajar) & truncated false", async () => {
    const auth = fakeAuth([
      fullPage(AUTH_PAGE_SIZE, "a"),
      [{ id: "u-1", email: "b@example.com" }],
    ]);

    const res = await findAuthUserByEmail(auth.listPage, "tidak-ada@example.com");

    expect(res.userId).toBeNull();
    expect(res.matchedEmail).toBeNull();
    expect(res.pages).toBe(2);
    expect(res.scanned).toBe(AUTH_PAGE_SIZE + 1);
    expect(res.truncated).toBe(false);
    expect(res.suggestions).toEqual([]);
  });

  test("tidak ada kecocokan persis → saran email mirip (maks 3)", async () => {
    const auth = fakeAuth([
      [
        { id: "1", email: "budi.santoso@example.com" },
        { id: "2", email: "budi.hartono@example.com" },
        { id: "3", email: "budiman@example.com" },
        { id: "4", email: "budi.aja@example.com" },
      ],
    ]);

    const res = await findAuthUserByEmail(auth.listPage, "budi.");

    expect(res.userId).toBeNull();
    expect(res.suggestions).toHaveLength(MAX_SUGGESTIONS);
    expect(res.suggestions[0]).toBe("budi.santoso@example.com");
  });

  test("typo 1 karakter (domain sama) → disarankan", async () => {
    const auth = fakeAuth([[{ id: "u-1", email: "akunjobside@gmail.com" }]]);

    const res = await findAuthUserByEmail(auth.listPage, "akunjobsid@gmail.com");

    expect(res.userId).toBeNull();
    expect(res.suggestions).toEqual(["akunjobside@gmail.com"]);
  });

  test("domain berbeda / beda jauh → tidak disarankan (hindari tebakan liar)", async () => {
    const auth = fakeAuth([
      [
        { id: "1", email: "budi@yahoo.com" },
        { id: "2", email: "abd@example.com" },
      ],
    ]);

    const res = await findAuthUserByEmail(auth.listPage, "xyz@example.com");

    expect(res.userId).toBeNull();
    expect(res.suggestions).toEqual([]);
  });

  test("typo (jarak edit ≤2) diutamakan di atas kecocokan parsial", async () => {
    const auth = fakeAuth([
      [
        { id: "1", email: "budi.santoso@example.com" },
        { id: "2", email: "budi.santosa@example" },
      ],
    ]);

    const res = await findAuthUserByEmail(auth.listPage, "budi.santoso@example");

    expect(res.userId).toBeNull();
    expect(res.suggestions).toEqual(["budi.santosa@example", "budi.santoso@example.com"]);
  });

  test("email kosong / hanya spasi → Auth API tidak dipanggil sama sekali", async () => {
    const auth = fakeAuth([[{ id: "u-1", email: "a@example.com" }]]);

    for (const q of ["", "   ", null]) {
      const res = await findAuthUserByEmail(auth.listPage, q as string);
      expect(res.userId).toBeNull();
      expect(res.scanned).toBe(0);
      expect(res.pages).toBe(0);
    }
    expect(auth.calls).toHaveLength(0);
  });

  test("user anonim (email null) dilewati, tidak dianggap cocok", async () => {
    const auth = fakeAuth([
      [
        { id: "anon", email: null },
        { id: "u-1", email: "ada@example.com" },
      ],
    ]);

    expect((await findAuthUserByEmail(auth.listPage, "ada@example.com")).userId).toBe("u-1");

    const miss = await findAuthUserByEmail(auth.listPage, "anon@example.com");
    expect(miss.userId).toBeNull();
    expect(miss.suggestions).toEqual([]);
  });

  test("listUsers error → AuthLookupError, BUKAN hasil 'tidak ditemukan'", async () => {
    const failing = async () => {
      throw new AuthLookupError("Invalid API key");
    };

    await expect(findAuthUserByEmail(failing, "budi@example.com")).rejects.toThrow(
      AuthLookupError
    );
    await expect(findAuthUserByEmail(failing, "budi@example.com")).rejects.toThrow(
      "Invalid API key"
    );
  });

  test("pagar aman halaman → truncated true (tidak diam-diam mengklaim kosong)", async () => {
    const alwaysFull = async ({ perPage }: { perPage: number }) =>
      fullPage(perPage, "padat");

    const res = await findAuthUserByEmail(alwaysFull, "tidak-ada@example.com", {
      pageSize: 10,
      maxPages: 3,
    });

    expect(res.truncated).toBe(true);
    expect(res.pages).toBe(3);
    expect(res.scanned).toBe(30);
  });
});
