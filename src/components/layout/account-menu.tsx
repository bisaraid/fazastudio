"use client";

/**
 * AccountMenu — klaster akun BERSAMA untuk semua navbar: landing
 * (`app/page.tsx`), app (`layout/navbar.tsx`), dan `/harga`.
 *
 * Kontrak identitas (konsisten di semua permukaan):
 *   - Trigger: Avatar (gambar/initial) + nama tampilan (≥sm);
 *     `aria-label`/`title` menyertakan email.
 *   - Header dropdown: Avatar `md` + nama + EMAIL (fallback "Tanpa email").
 *   - Item: Dashboard, Pengaturan, Panel Admin (bila `is_admin`), Keluar.
 *   - Loading: skeleton tombol bulat. Tamu: CTA Masuk + Daftar (bisa dioverride
 *     lewat prop `guest` — landing punya nav link sendiri).
 *
 * Mode data:
 *   - Default (tanpa props): mandiri — `useUser()` + fetch `/api/profile`
 *     (dipakai `/harga` yang sebelumnya tidak punya state auth).
 *   - Terkendeli (`user`/`loading`/`profile` dikirim): TIDAK ada useUser/fetch
 *     ganda — dipakai navbar & landing yang sudah punya state tersebut
 *     (navbar butuh `profile` untuk link Panel Admin di drawer mobile).
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { showAdminLink } from "@/lib/admin-link";
import { useUser } from "@/hooks/useUser";
import {
  Avatar,
  avatarSourceFromUser,
  displayNameOf,
  isValidAvatarUrl,
} from "@/components/layout/avatar";
import {
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";

export interface AccountProfile {
  full_name?: string;
  avatar_url?: string;
  is_admin?: boolean;
}

interface AccountMenuProps {
  /** Mode terkendeli — kirim bila caller sudah punya session (hindari dobel fetch). */
  user?: User | null;
  loading?: boolean;
  profile?: AccountProfile | null;
  /** CTA tamu kustom; default = Masuk (outline) + Daftar (solid). */
  guest?: ReactNode;
  /** Dipanggil setelah menu ditutup / navigasi dari menu. */
  onNavigate?: () => void;
  /** Tujuan setelah keluar (default "/masuk"). */
  logoutRedirect?: string;
  className?: string;
}

export function AccountMenu({
  user,
  loading,
  profile,
  guest,
  onNavigate,
  logoutRedirect = "/masuk",
  className,
}: AccountMenuProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // useUser selalu dipanggil (aturan hook), hasilnya hanya dipakai bila tak terkendeli.
  const internal = useUser();
  const controlled = user !== undefined;
  const authUser = controlled ? user : internal.user;
  const authLoading = loading ?? (controlled ? false : internal.loading);

  const [internalProfile, setInternalProfile] = useState<AccountProfile | null>(null);
  useEffect(() => {
    if (controlled || profile !== undefined || !authUser) return;
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success || !data?.data) return;
        setInternalProfile({
          full_name: data.data.full_name,
          avatar_url: data.data.avatar_url,
          is_admin: data.data.is_admin === true,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [controlled, profile, authUser]);

  const resolvedProfile = profile !== undefined ? profile : internalProfile;

  const email = authUser?.email ?? "";
  const displayName =
    resolvedProfile?.full_name?.trim() || displayNameOf(authUser, "Akun");
  const avatarRaw = isValidAvatarUrl(resolvedProfile?.avatar_url)
    ? (resolvedProfile?.avatar_url ?? "")
    : avatarSourceFromUser(authUser);

  const close = () => {
    setShowMenu(false);
    onNavigate?.();
  };

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // abaikan — tetap arahkan ke halaman masuk
    }
    close();
    router.push(logoutRedirect);
  };

  if (authLoading) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className ?? "rounded-full"}
        disabled
        aria-label="Memuat sesi"
      >
        <UserIcon className="h-4 w-4" aria-hidden="true" />
      </Button>
    );
  }

  if (!authUser) {
    return (
      <div className={className ?? "flex items-center gap-2"}>
        {guest ?? (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/masuk">Masuk</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/daftar">Daftar</Link>
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={className ?? "relative flex items-center gap-2"}>
      <button
        type="button"
        onClick={() => setShowMenu((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={showMenu}
        aria-label={`Menu akun: ${email || displayName}`}
        title={email || displayName}
        className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 transition-colors hover:bg-accent"
      >
        <Avatar src={avatarRaw} name={displayName} email={email} size="xs" />
        <span className="hidden max-w-[140px] truncate text-sm font-medium sm:inline">
          {displayName}
        </span>
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            aria-label="Menu akun"
            className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border bg-popover p-1 shadow-md"
          >
            {/* Header identitas: avatar + nama + EMAIL (fallback "Tanpa email"). */}
            <div className="flex items-center gap-3 border-b px-2 py-2">
              <Avatar src={avatarRaw} name={displayName} email={email} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">
                  {displayName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {email || "Tanpa email"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => go("/beranda")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              role="menuitem"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => go("/pengaturan")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              role="menuitem"
            >
              <Settings className="h-4 w-4" />
              Pengaturan
            </button>
            {/* Link admin: hanya bila status admin diketahui & true
                (profil dari /api/profile — tanpa request tambahan). */}
            {showAdminLink(resolvedProfile) && (
              <button
                type="button"
                onClick={() => go("/admin")}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                role="menuitem"
              >
                <ShieldCheck className="h-4 w-4" />
                Panel Admin
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-accent disabled:opacity-60"
              role="menuitem"
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Keluar..." : "Keluar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default AccountMenu;
