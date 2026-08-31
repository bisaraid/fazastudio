"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  Sun,
  Moon,
  Sparkles,
  Menu,
  LogOut,
  Settings,
  User,
  LayoutDashboard,
  CreditCard,
  X,
} from "lucide-react";
import { useState } from "react";

interface NavbarProps {
  onMenuToggle?: () => void;
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // abaikan — tetap arahkan ke /masuk
    }
    setShowUserMenu(false);
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>

            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <User className="h-4 w-4" />
              </Button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border bg-popover p-1 shadow-md">
                    <button
                      onClick={() => { router.push("/pengaturan"); setShowUserMenu(false); }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Settings className="h-4 w-4" />
                      Pengaturan
                    </button>
                    <button
                      onClick={handleLogout}
                      disabled={loggingOut}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <LogOut className="h-4 w-4" />
                      {loggingOut ? "Keluar..." : "Keluar"}
                    </button>
                  </div>
                </>
              )}
            </div>
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
