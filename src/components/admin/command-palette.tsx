"use client";

/**
 * Command palette admin (⌘K / Ctrl+K) — navigasi antar halaman admin.
 *
 * Komponen ini di-load LAZY (`next/dynamic` + `ssr: false` di layout) dan baru
 * di-mount saat pertama kali dibuka. Tidak ada request tambahan dan tidak ada
 * data yang di-fetch: item diambil dari daftar statis `nav-items.ts`.
 *
 * Pola keyboard: input tetap fokus (combobox + aria-activedescendant),
 * jadi ArrowUp/ArrowDown/Enter/Escape bekerja tanpa perlu focus-trap.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { ADMIN_NAV_ITEMS, searchNavItems } from "@/components/admin/nav-items";
import { cn } from "@/lib/utils";

export interface CommandPaletteProps {
  onClose: () => void;
  /** Href halaman aktif (diberi label "Sekarang"). */
  currentPath?: string | null;
}

export default function CommandPalette({ onClose, currentPath }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => searchNavItems(query), [query]);

  // Fokus ke input begitu palette tampil.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Kunci scroll halaman di belakang palette.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Pastikan item aktif tetap terlihat saat dinavigasi dengan keyboard.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results.length]);

  function go(href: string) {
    onClose();
    if (href !== currentPath) router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex] ?? results[0];
      if (item) go(item.href);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-3 pt-[8vh] sm:pt-[12vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pencarian cepat admin"
        className="admin-page-enter w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Cari halaman admin..."
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded="true"
            aria-controls="admin-cp-list"
            aria-autocomplete="list"
            aria-activedescendant={results.length ? `admin-cp-opt-${activeIndex}` : undefined}
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
            Esc
          </kbd>
        </div>

        <ul
          ref={listRef}
          id="admin-cp-list"
          role="listbox"
          aria-label="Halaman admin"
          className="max-h-[50vh] overflow-y-auto p-1.5 sm:max-h-[60vh]"
        >
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Tidak ada halaman yang cocok.
            </li>
          )}
          {results.map((item, i) => {
            const Icon = item.icon;
            const active = i === activeIndex;
            const isCurrent = item.href === currentPath;
            return (
              <li key={item.href} role="presentation">
                <button
                  type="button"
                  id={`admin-cp-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={active}
                  onClick={() => go(item.href)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.href}</span>
                  </span>
                  {isCurrent && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      Sekarang
                    </span>
                  )}
                  {active && !isCurrent && (
                    <CornerDownLeft
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="hidden items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground sm:flex">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/60 px-1 py-0.5">&uarr;</kbd>
            <kbd className="rounded border border-border bg-muted/60 px-1 py-0.5">&darr;</kbd>
            pilih
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/60 px-1 py-0.5">Enter</kbd>
            buka
          </span>
          <span className="ml-auto">{ADMIN_NAV_ITEMS.length} halaman</span>
        </div>
      </div>
    </div>
  );
}
