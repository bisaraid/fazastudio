"use client";

/**
 * ThemeToggle — pilih tema: Terang / Gelap / Ikuti sistem (3 opsi).
 *
 * Catatan desain (kenapa seperti ini):
 *  - Tanpa dependensi baru & tanpa request: hanya `useTheme()` dari
 *    next-themes yang sudah terpasang di layout.tsx (defaultTheme="dark").
 *  - Ikon trigger memakai varian CSS `dark:` (bukan state React) sehingga
 *    HTML pra-hidrasi = pasca-hidrasi: nol mismatch & nol layout shift.
 *    Ikon ini selalu mencerminkan tema yang SEDANG tampil, termasuk saat mode
 *    "Ikuti sistem" (system → resolved oleh next-themes jadi class di <html>).
 *  - Menu baru dirender setelah interaksi user, jadi nilai `theme` (yang
 *    `undefined` sampai mounted) tidak pernah dipakai saat render awal.
 *  - Aksesibilitas: trigger `aria-haspopup="menu"` + `aria-expanded`,
 *    item `role="menuitemradio"` + `aria-checked`, navigasi panah
 *    ↑/↓/Home/End, Escape menutup & mengembalikan fokus ke trigger,
 *    klik/tap di luar menutup, dan focus ring terlihat.
 */

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Monitor, Moon, Sun } from "lucide-react";

/** Urutan tetap (stabil; tidak berubah mengikuti preferensi OS). */
const THEME_OPTIONS = [
  { value: "light", label: "Terang", icon: Sun },
  { value: "dark", label: "Gelap", icon: Moon },
  { value: "system", label: "Ikuti sistem", icon: Monitor },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Tutup saat klik/tap di luar.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  // Saat dibuka, fokus langsung ke opsi yang aktif (fallback: opsi pertama).
  useEffect(() => {
    if (!open) return;
    const active = THEME_OPTIONS.findIndex((o) => o.value === theme);
    itemRefs.current[active >= 0 ? active : 0]?.focus();
  }, [open, theme]);

  function onItemKeyDown(e: React.KeyboardEvent, index: number) {
    const last = THEME_OPTIONS.length - 1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const next = (index + delta + THEME_OPTIONS.length) % THEME_OPTIONS.length;
      itemRefs.current[next]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itemRefs.current[last]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      // Biarkan Tab memindahkan fokus, tapi jangan tinggalkan menu terbuka.
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative", className)} ref={wrapRef}>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Ubah tema tampilan"
        className={cn("relative", open && "bg-accent text-accent-foreground")}
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

      {open && (
        <div
          role="menu"
          aria-label="Pilih tema tampilan"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-44 rounded-xl border bg-popover p-1 shadow-lg"
        >
          {THEME_OPTIONS.map((option, index) => {
            const Icon = option.icon;
            // `theme` = pilihan tersimpan; undefined sebelum mounted → tak ada
            // opsi yang ditandai (tidak menebak, tidak mismatch).
            const active = theme === option.value;
            return (
              <button
                key={option.value}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                onKeyDown={(e) => onItemKeyDown(e, index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {option.label}
                {active && (
                  <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
