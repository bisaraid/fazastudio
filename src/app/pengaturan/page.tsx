"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Pencil, Sparkles, CreditCard, LogOut } from "lucide-react";
import {
  LAYER1_OPTIONS,
  NICHES,
  GAYA_BY_NICHE,
} from "@/lib/persona-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface Profile {
  layer1_mode: string;
  niche_slug: string;
  gaya_key: string;
  cerita_key: string;
  genre_tags?: string[];
  platform_tags?: string[];
}

function modeLabel(mode: string): string {
  return LAYER1_OPTIONS.find((o) => o.key === mode)?.label ?? mode;
}

function nicheLabel(niche: string): string {
  const all = [...NICHES.jualan, ...NICHES.konten];
  return all.find((n) => n.slug === niche)?.label ?? niche;
}

function gayaLabel(niche: string, gaya: string): string {
  return (GAYA_BY_NICHE[niche] ?? []).find((g) => g.key === gaya)?.label ?? gaya;
}

export default function PengaturanPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.success && data?.data) setProfile(data.data);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // tetap lanjut
    }
    router.push("/masuk");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-3xl px-4 py-8 lg:px-8">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => router.push("/beranda")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pengaturan</h1>
            <p className="text-muted-foreground">Profil dan preferensi konten kamu</p>
          </div>
        </div>

        {/* PROFIL */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Profil Konten
            </CardTitle>
            <CardDescription>
              Gaya konten yang kami pakai saat generate untuk kamu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Memuat profil...</p>
            ) : profile ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Tujuan</p>
                  <p className="font-medium">{modeLabel(profile.layer1_mode)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Niche</p>
                  <p className="font-medium">{nicheLabel(profile.niche_slug)}</p>
                </div>
                {profile.gaya_key && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Gaya ngomong</p>
                    <p className="font-medium">{gayaLabel(profile.niche_slug, profile.gaya_key)}</p>
                  </div>
                )}
                {profile.cerita_key && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Cara cerita</p>
                    <p className="font-medium">{profile.cerita_key}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Profil belum lengkap. Selesaikan personalisasi dulu.
              </p>
            )}

            <Button variant="outline" onClick={() => router.push("/mulai")} className="gap-1.5">
              <Pencil className="h-4 w-4" /> Ubah Profil
            </Button>
          </CardContent>
        </Card>

        {/* AKUN */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Akun</CardTitle>
            <CardDescription>Keluar dari perangkat ini.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="ghost" className="gap-1.5 text-destructive" onClick={handleLogout} disabled={loggingOut}>
              <LogOut className="h-4 w-4" /> {loggingOut ? "Keluar..." : "Keluar"}
            </Button>
          </CardContent>
        </Card>

        {/* BILLING / PLAN — arahkan ke /harga */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> Paket & Kredit
            </CardTitle>
            <CardDescription>
              Lihat paket, upgrade, dan kredit generate kamu di halaman Harga.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/harga")} className="gap-1.5">
              <CreditCard className="h-4 w-4" /> Ke Halaman Harga
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}