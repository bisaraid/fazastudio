/**
 * Utilitas tema — fungsi murni (tanpa React) supaya bisa diuji dengan Vitest.
 *
 * Latar belakang: tema "Ikuti sistem" DIHAPUS (kini hanya Terang/Gelap).
 * User yang dulu memilih "Ikuti sistem" menyimpan nilai `"system"` di
 * localStorage; bila dibiarkan, next-themes (dengan `enableSystem={false}`)
 * akan menerapkan class `system` ke <html> sehingga gaya `dark:` tidak aktif.
 * `normalizeStoredTheme` menentukan tema pengganti untuk nilai lama tersebut.
 */

/** Kunci penyimpanan next-themes (default library; tidak diubah). */
export const THEME_STORAGE_KEY = "theme";

export type AppTheme = "light" | "dark";

/**
 * Tentukan tema pengganti untuk nilai tersimpan yang tidak lagi valid.
 *
 * @param stored      nilai `localStorage[THEME_STORAGE_KEY]`
 * @param prefersDark preferensi OS saat ini — hanya dipakai bila `stored === "system"`
 * @returns tema pengganti (`"light"` | `"dark"`), atau `null` bila TIDAK perlu
 *   diubah (sudah `"light"`/`"dark"`, atau belum ada nilai sama sekali).
 *
 * Nilai tak dikenal (mis. `"blue"`) diperlakukan perlu dinormalkan → `"light"`
 * (aman: sama dengan perilaku default tanpa class `dark`).
 */
export function normalizeStoredTheme(
  stored: string | null | undefined,
  prefersDark: boolean
): AppTheme | null {
  if (stored == null) return null;
  const value = stored.trim().toLowerCase();
  if (value === "") return null;
  if (value === "light" || value === "dark") return null;
  if (value === "system") return prefersDark ? "dark" : "light";
  return "light";
}
