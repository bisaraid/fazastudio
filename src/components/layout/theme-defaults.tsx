"use client";

import { useEffect } from "react";
import { THEME_STORAGE_KEY, normalizeStoredTheme } from "@/lib/theme";

/**
 * Normalisasi tema satu kali setelah mount.
 *
 * Sejak opsi "Ikuti sistem" dihapus, nilai lama `localStorage.theme === "system"`
 * (atau nilai tak dikenal) dinormalkan ke tema yang sedang tampil, dan class
 * sisa `system` dibuang dari <html> — supaya varian CSS `dark:` selalu benar.
 *
 * Tidak merender apa pun (return null). Dijalankan sekali di root layout.
 */
export function ThemeDefaults() {
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // localStorage diblokir (mis. mode privat ketat) → biarkan default.
      return;
    }

    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    const root = document.documentElement;
    // Buang HANYA class "system" (class lain di <html> tidak disentuh).
    root.classList.remove("system");

    const next = normalizeStoredTheme(stored, prefersDark);
    if (!next) return;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Gagal menulis storage bukan alasan untuk menggagalkan render.
    }
    root.classList.toggle("dark", next === "dark");
  }, []);

  return null;
}
