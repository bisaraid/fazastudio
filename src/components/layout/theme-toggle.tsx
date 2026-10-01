"use client";

/**
 * ThemeToggle — sakelar tema SATU KLIK: Terang ⇄ Gelap.
 *
 * Catatan desain (kenapa seperti ini):
 *  - Tanpa dependensi baru & tanpa request: hanya `useTheme()` dari
 *    next-themes yang sudah terpasang di layout.tsx (defaultTheme="dark").
 *  - Opsi "Ikuti sistem" DIHAPUS — hanya dua status (light/dark). Nilai lama
 *    `"system"` dinormalkan sekali oleh <ThemeDefaults /> di root layout.
 *  - Ikon memakai varian CSS `dark:` (bukan state React) sehingga HTML
 *    pra-hidrasi = pasca-hidrasi: nol mismatch & nol layout shift. Ikon selalu
 *    mencerminkan tema yang SEDANG tampil.
 *  - Klik membaca tema nyata dari class di <html> (sumber kebenaran setelah
 *    next-themes menerapkan tema), jadi tombol tetap benar walau
 *    `useTheme().resolvedTheme` belum siap sebelum mount.
 *  - `aria-label`/`title`/`aria-pressed` diisi setelah mount supaya nilai
 *    render pertama (server & klien) identik → tanpa warning hidrasi.
 */

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const label = mounted
    ? isDark
      ? "Ganti ke tema terang"
      : "Ganti ke tema gelap"
    : "Ubah tema tampilan";

  function toggle() {
    // Baca dari DOM: nilai yang benar-benar aktif saat ini (bukan state React).
    const darkNow = document.documentElement.classList.contains("dark");
    setTheme(darkNow ? "light" : "dark");
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={mounted ? isDark : undefined}
      className={cn("relative", className)}
    >
      <Sun
        className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
        aria-hidden="true"
      />
      <Moon
        className="absolute inset-0 m-auto h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
        aria-hidden="true"
      />
    </Button>
  );
}
