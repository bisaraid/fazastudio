import { test, expect, describe } from "vitest";
import { showAdminLink } from "@/lib/admin-link";

// ============================================================
// showAdminLink — kapan link "Panel Admin" boleh dirender.
//
// Aturan produk: jangan render apa pun sebelum status diketahui
// (tanpa kedip), dan hanya `true` asli yang menampilkan link.
// ============================================================

describe("showAdminLink", () => {
  test("admin (is_admin true) → tampil", () => {
    expect(showAdminLink({ is_admin: true })).toBe(true);
  });

  test("non-admin (is_admin false) → sembunyi", () => {
    expect(showAdminLink({ is_admin: false })).toBe(false);
  });

  test("profil belum diketahui (null/undefined) → sembunyi", () => {
    expect(showAdminLink(null)).toBe(false);
    expect(showAdminLink(undefined)).toBe(false);
  });

  test("profil ada tapi field is_admin tidak ada → sembunyi", () => {
    const tanpaFlag: { is_admin?: unknown; full_name?: string } = {
      full_name: "Budi",
    };
    expect(showAdminLink({})).toBe(false);
    expect(showAdminLink(tanpaFlag)).toBe(false);
  });

  test("nilai bukan boolean asli tidak pernah menampilkan link", () => {
    expect(showAdminLink({ is_admin: "true" })).toBe(false);
    expect(showAdminLink({ is_admin: 1 })).toBe(false);
    expect(showAdminLink({ is_admin: null })).toBe(false);
  });
});
