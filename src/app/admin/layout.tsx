"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";

/**
 * Command palette di-load LAZY: modulnya terpisah dari bundle halaman admin,
 * jadi tidak menambah berat load awal. Baru diunduh saat user membuka ⌘K atau
 * meng-hover/fokus search bar di topbar (prefetch via warmPalette).
 */
const CommandPalette = dynamic(() => import("@/components/admin/command-palette"), {
  ssr: false,
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  /** Muat chunk palette lebih awal tanpa me-render (instan saat dibuka). */
  const warmPalette = useCallback(() => {
    void import("@/components/admin/command-palette");
  }, []);

  const openPalette = useCallback(() => {
    warmPalette();
    setPaletteOpen(true);
  }, [warmPalette]);

  // 1) Autentikasi: jika tidak login → redirect "/".
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  // 2) is_admin: cek ringan ke /api/admin/check.
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/check");
        const json = await res.json();
        if (!active) return;
        if (!res.ok || !json?.isAdmin) {
          router.replace("/");
        } else {
          setIsAdmin(true);
        }
      } catch {
        if (active) router.replace("/");
      }
    })();
    return () => {
      active = false;
    };
  }, [user, router]);

  // 3) Mobile: auto-close sidebar + tutup palette saat pindah halaman.
  useEffect(() => {
    setSidebarOpen(false);
    setPaletteOpen(false);
  }, [pathname]);

  // 4) Shortcut global ⌘K / Ctrl+K untuk command palette.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((open) => {
          if (!open) warmPalette();
          return !open;
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [warmPalette]);

  if (loading || isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Memeriksa akses admin...
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMenuToggle={() => setSidebarOpen(true)}
          user={user}
          onOpenPalette={openPalette}
          onPrefetchPalette={warmPalette}
        />
        <main
          key={pathname}
          className="admin-page-enter flex-1 overflow-y-auto p-6"
        >
          {children}
        </main>
      </div>
      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} currentPath={pathname} />
      )}
    </div>
  );
}