"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

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

  // 3) Mobile: auto-close sidebar saat pindah halaman.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading || isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Memeriksa akses admin...
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onMenuToggle={() => setSidebarOpen(true)} user={user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}