"use client";

import { Menu, Search } from "lucide-react";
import { useUser } from "@/hooks/useUser";

export interface TopbarProps {
  onMenuToggle: () => void;
}

export function Topbar({ onMenuToggle }: TopbarProps) {
  const { user } = useUser();
  const email = user?.email;
  const initial = (email?.trim().charAt(0) ?? "?").toUpperCase();
  const shortName = email ? email.split("@")[0] : "Admin";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
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

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold">
          {initial}
        </div>
        <span className="hidden max-w-[140px] truncate text-sm text-muted-foreground sm:block">
          {shortName}
        </span>
      </div>
    </header>
  );
}