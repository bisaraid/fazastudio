import Link from "next/link";
import { PricingPlans } from "@/components/pricing-plans";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export default function HargaPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center px-4 lg:px-6">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Faza Studio</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/masuk">Masuk</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/daftar">Daftar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-16 lg:px-8">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Harga yang sederhana</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Mulai gratis, naikkan kapan saja. Tanpa kartu kredit untuk memulai.
          </p>
        </div>

        <PricingPlans />

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