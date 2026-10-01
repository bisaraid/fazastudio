import { describe, expect, test } from "vitest";
import { normalizeStoredTheme, THEME_STORAGE_KEY } from "@/lib/theme";

describe("normalizeStoredTheme", () => {
  test("kunci penyapan next-themes tidak diubah", () => {
    expect(THEME_STORAGE_KEY).toBe("theme");
  });

  test('"system" → ikut preferensi OS saat ini', () => {
    expect(normalizeStoredTheme("system", true)).toBe("dark");
    expect(normalizeStoredTheme("system", false)).toBe("light");
  });

  test('"light"/"dark" sudah valid → null (tidak perlu diubah)', () => {
    expect(normalizeStoredTheme("light", true)).toBeNull();
    expect(normalizeStoredTheme("dark", false)).toBeNull();
  });

  test("null/undefined/kosong → null (belum pernah disetel)", () => {
    expect(normalizeStoredTheme(null, true)).toBeNull();
    expect(normalizeStoredTheme(undefined, false)).toBeNull();
    expect(normalizeStoredTheme("", true)).toBeNull();
    expect(normalizeStoredTheme("   ", false)).toBeNull();
  });

  test("nilai tak dikenal → light (aman, default tanpa class dark)", () => {
    expect(normalizeStoredTheme("blue", true)).toBe("light");
    expect(normalizeStoredTheme("biru", false)).toBe("light");
  });

  test("tidak sensitif besar-kecil huruf & spasi pinggir", () => {
    expect(normalizeStoredTheme("SYSTEM", true)).toBe("dark");
    expect(normalizeStoredTheme("  Dark  ", true)).toBeNull();
    expect(normalizeStoredTheme(" LIGHT ", false)).toBeNull();
  });
});
