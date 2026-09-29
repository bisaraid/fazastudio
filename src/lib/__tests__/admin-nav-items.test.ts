import { test, expect, describe } from "vitest";
import { ADMIN_NAV_GROUPS, ADMIN_NAV_ITEMS, searchNavItems } from "@/components/admin/nav-items";

describe("ADMIN_NAV_ITEMS", () => {
  test("semua item punya label, href admin, grup, dan kata kunci", () => {
    expect(ADMIN_NAV_ITEMS.length).toBeGreaterThan(0);
    for (const item of ADMIN_NAV_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.href.startsWith("/admin/")).toBe(true);
      expect(item.group.length).toBeGreaterThan(0);
      expect(item.keywords.length).toBeGreaterThan(0);
    }
  });

  test("tidak ada href duplikat", () => {
    const hrefs = ADMIN_NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test("jumlah item sesuai jumlah item di grup", () => {
    const total = ADMIN_NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
    expect(ADMIN_NAV_ITEMS.length).toBe(total);
  });
});

describe("searchNavItems", () => {
  test("query kosong/spasi -> semua item", () => {
    expect(searchNavItems("")).toHaveLength(ADMIN_NAV_ITEMS.length);
    expect(searchNavItems("   ")).toHaveLength(ADMIN_NAV_ITEMS.length);
  });

  test("cocok pada awalan label", () => {
    expect(searchNavItems("dash")[0].href).toBe("/admin/overview");
  });

  test("case-insensitive dan trim", () => {
    expect(searchNavItems("  USERS  ")[0].href).toBe("/admin/users");
  });

  test("cocok lewat kata kunci sinonim", () => {
    expect(searchNavItems("pembayaran")[0].href).toBe("/admin/transaksi");
    expect(searchNavItems("harvest")[0].href).toBe("/admin/trending");
    expect(searchNavItems("pengguna")[0].href).toBe("/admin/users");
  });

  test("cocok lewat potongan href", () => {
    const hasil = searchNavItems("/admin/tr").map((i) => i.href);
    expect(hasil).toContain("/admin/trending");
    expect(hasil).toContain("/admin/transaksi");
  });

  test("label yang diawali query diprioritaskan di atas keyword", () => {
    // "trend" diawali label "Trending" → harus di atas item lain yang hanya
    // cocok lewat keyword/href.
    const hasil = searchNavItems("trend");
    expect(hasil[0].href).toBe("/admin/trending");
  });

  test("query tak dikenal -> array kosong (bukan error)", () => {
    expect(searchNavItems("zzzzz")).toEqual([]);
  });

  test("deterministik: query sama -> urutan sama", () => {
    const a = searchNavItems("plan").map((i) => i.href);
    const b = searchNavItems("plan").map((i) => i.href);
    expect(a).toEqual(b);
  });

  test("bisa dipakai dengan daftar item kustom", () => {
    const custom = [
      { label: "Zeta", href: "/admin/zeta", icon: ADMIN_NAV_ITEMS[0].icon, group: "X", keywords: ["akhir"] },
    ];
    expect(searchNavItems("zeta", custom)).toHaveLength(1);
    expect(searchNavItems("users", custom)).toHaveLength(0);
  });
});