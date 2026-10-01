"use client";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AccountMenu } from "@/components/layout/account-menu";
import {
  Avatar,
  avatarSourceFromUser,
  displayNameOf,
  isValidAvatarUrl,
} from "@/components/layout/avatar";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { showAdminLink } from "@/lib/admin-link";
import { useUsage } from "@/hooks/useUsage";
import { useUser } from "@/hooks/useUser";
import {
  Sparkles,
  Menu,
  LogOut,
  Settings,
  ShieldCheck,
  LayoutDashboard,
  CreditCard,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

interface NavbarProps {
  onMenuToggle?: () => void;
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const router = useRouter();
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { plan, creditsUsed, creditsTotal, loading } = useUsage();
  const creditsRemaining = Math.max(0, (creditsTotal ? creditsTotal : 0) - (creditsUsed ? creditsUsed : 0));
  const { user: authUser, loading: authLoading } = useUser();
  const [profile, setProfile] = useState<{
    full_name?: string;
    avatar_url?: string;
    is_admin?: boolean;
  } | null>(null);
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.success && data?.data)
          setProfile({
            full_name: data.data.full_name,
            avatar_url: data.data.avatar_url,
            is_admin: data.data.is_admin === true,
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authUser]);
  const email = authUser?.email ?? "";
  const displayName = profile?.full_name?.trim() || displayNameOf(authUser, "Akun");
  const avatarUrl = isValidAvatarUrl(profile?.avatar_url)
    ? (profile?.avatar_url ?? "")
    : avatarSourceFromUser(authUser);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // abaikan — tetap arahkan ke /masuk
    }
    setShowMobileDrawer(false);
    router.push("/masuk");
  };

  const handleMenuToggle = () => {
    setShowMobileDrawer(!showMobileDrawer);
    onMenuToggle?.();
  };

  const mobileNavLinks = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/beranda" },
    { label: "Harga", icon: CreditCard, href: "/harga" },
    { label: "Pengaturan", icon: Settings, href: "/pengaturan" },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 lg:px-6">
          <button
            onClick={handleMenuToggle}
            className="mr-2 md:hidden"
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="hidden sm:inline">Faza Studio</span>
            <span className="sm:hidden">Faza Studio</span>
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1 ml-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/beranda")}
              className="text-muted-foreground hover:text-foreground"
            >
              Dashboard
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/pengaturan")}
              className="text-muted-foreground hover:text-foreground"
            >
              Pengaturan
            </Button>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {!loading && (
              <span className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground md:flex">
                {creditsRemaining} kredit tersisa
              </span>
            )}
            {plan && plan !== "free" ? (
              <Badge variant="outline" className="hidden md:inline-flex">
                {plan === "starter" ? "Starter" : plan === "pro" ? "Pro" : plan}
              </Badge>
            ) : null}
            {/* Tema: sekali klik Terang ⇄ Gelap (tanpa opsi "Ikuti sistem"). */}
            <ThemeToggle />

            {/* Klaster akun bersama (avatar + nama + email di trigger & menu) —
                konsisten dengan landing dan /harga. */}
            <AccountMenu user={authUser} loading={authLoading} profile={profile} />
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {showMobileDrawer && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setShowMobileDrawer(false)}
          />
          <div className="fixed top-0 left-0 z-50 h-full w-64 bg-background border-r shadow-xl md:hidden animate-in slide-in-from-left">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-5 w-5 text-primary" />
                <span>Faza Studio</span>
              </div>
              <button onClick={() => setShowMobileDrawer(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Identitas akun di drawer: avatar + nama + EMAIL (konsisten
                dengan menu desktop & permukaan lain). */}
            {authUser && (
              <div className="flex items-center gap-3 border-b p-4">
                <Avatar src={avatarUrl} name={displayName} email={email} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {email || "Tanpa email"}
                  </p>
                </div>
              </div>
            )}
            <nav className="p-4 space-y-1">
              {mobileNavLinks.map((link) => (
                <button
                  key={link.href}
                  onClick={() => {
                    router.push(link.href);
                    setShowMobileDrawer(false);
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm hover:bg-accent transition-colors"
                >
                  <link.icon className="h-5 w-5 text-muted-foreground" />
                  {link.label}
                </button>
              ))}
              {/* Link admin (mobile) — syarat sama: hanya bila is_admin true */}
              {showAdminLink(profile) && (
                <button
                  onClick={() => {
                    router.push("/admin");
                    setShowMobileDrawer(false);
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm hover:bg-accent transition-colors"
                >
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                  Panel Admin
                </button>
              )}
              <div className="border-t my-3" />
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                {loggingOut ? "Keluar..." : "Keluar"}
              </button>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
