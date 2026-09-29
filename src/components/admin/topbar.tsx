"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ExternalLink, LogOut, Menu, Search, ShieldCheck } from "lucide-react";
import { Avatar, avatarSourceFromUser, displayNameOf } from "@/components/admin/avatar";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export interface TopbarProps {
  onMenuToggle: () => void;
  /** User admin dari useUser() di layout (tanpa request tambahan). */
  user?: Pick<User, "email" | "user_metadata"> | null;
}

export function Topbar({ onMenuToggle, user }: TopbarProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const name = displayNameOf(user);
  const email = user?.email ?? "";
  const avatarUrl = avatarSourceFromUser(user);

  // Menu akun: tutup saat klik di luar atau tekan Escape (fokus balik ke trigger).
  useEffect(() => {
    if (!menuOpen) return;
    function onDocPointerDown(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } catch {
      // diabaikan — tetap arahkan ke halaman publik
    }
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <button
        type="button"
        onClick={onMenuToggle}
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/50 lg:hidden"
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative ml-auto w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Cari user, topik..."
          className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="relative shrink-0" ref={wrapRef}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Menu akun: ${email || name}`}
          className={cn(
            "flex items-center gap-2 rounded-full border border-transparent p-1 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            menuOpen && "border-border bg-muted/50"
          )}
        >
          <Avatar src={avatarUrl} name={name} email={email} size="sm" />
          <span className="hidden max-w-[140px] truncate pr-1 text-sm text-muted-foreground sm:block">
            {name}
          </span>
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Menu akun admin"
            className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            <div className="flex items-center gap-3 border-b border-border px-3 py-3">
              <Avatar src={avatarUrl} name={name} email={email} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{email || "Tanpa email"}</p>
              </div>
            </div>

            <div className="border-b border-border px-3 py-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                Admin
              </span>
            </div>

            <div className="p-1">
              <Link
                href="/beranda"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                Buka aplikasi
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                {loggingOut ? "Keluar..." : "Keluar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}