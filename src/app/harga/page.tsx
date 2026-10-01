"use client";

import Link from "next/link";
import { PricingPlansWithUsage } from "@/components/pricing-plans-with-usage";
import { PlanStatusCard } from "@/components/plan-status-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AccountMenu } from "@/components/layout/account-menu";
import { useUser } from "@/hooks/useUser";
import { Sparkles } from "lucide-react";

/**
 * Halaman /harga (publik):
 * - Header konsisten dengan landing/app: brand + ThemeToggle + AccountMenu
 *   (avatar+nama+email saat login; Masuk/Daftar saat tamu).
 * - User login melihat kartu status plan & kredit (PlanStatusCard) di atas
 *   daftar plan; tamu langsung melihat plan.
 * - Daftar plan dari PricingPlansWithUsage (highlight plan aktif + banding fitur).
 */
export default function HargaPage() {
  const { user } = useUser();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Faza Studio</span>
          </Link>
          <div className="flex-1" />
          {/* Tema: sekali klik Terang ⇄ Gelap (konsisten dengan navbar lain). */}
          <ThemeToggle className="mr-2" />
          {/* Klaster akun bersama — trigger & menu identik dengan landing/app. */}
          <AccountMenu />
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-16 lg:px-8">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Harga yang sederhana</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Mulai gratis, naikkan kapan saja. Tanpa kartu kredit untuk memulai.
          </p>
        </div>

        {/* Status plan user login: paket aktif + sisa kredit + aksi kelola. */}
        {user && (
          <Card className="mb-8">
            <CardContent className="pt-6">
              <PlanStatusCard
                cta={
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/pengaturan">Kelola di Pengaturan</Link>
                  </Button>
                }
              />
            </CardContent>
          </Card>
        )}

        <PricingPlansWithUsage />

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Ada pertanyaan?{" "}
          <Link href="/masuk" className="font-medium text-primary underline underline-offset-2">
            Hubungi kami
          </Link>
        </p>
      </main>
    </div>
  );
}
