"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProjectStore } from "@/lib/store/projectStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PricingPlans } from "@/components/pricing-plans";
import { Sparkles, ArrowRight, TrendingUp, Wand2, Upload, Loader2, Quote } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const { createProject } = useProjectStore();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Coba Gratis" → buat project anonim → langsung buka editor (alur conversion).
  const handleCobaGratis = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const project = await createProject({
        genre: "",
        customGenre: undefined,
        topic: "",
        tone: "kasual",
        targetDuration: 0,
        platform: "",
        mode: "step-by-step",
        voiceName: "Sari",
        voiceLanguage: "id-ID",
        voiceSpeed: 1.0,
        voiceEmotion: "netral",
        visualStyle: "stock",
      });
      if (project?.id) router.push(`/konten/${project.id}`);
    } catch {
      setError("Gagal membuat sesi. Coba lagi.");
      setCreating(false);
    }
  };

  const steps = [
    {
      icon: TrendingUp,
      title: "Pilih trend",
      desc: "Ambil ide dari tren terbaru atau pilih topik/kategori favoritmu (horor, misteri, keuangan, dan lainnya).",
    },
    {
      icon: Wand2,
      title: "AI buat",
      desc: "Faza Studio menyusun script, suara, subtitle, dan video secara otomatis dalam satu alur.",
    },
    {
      icon: Upload,
      title: "Upload",
      desc: "Hasil siap dipakai — unduh dan langsung publikasikan ke platform tujuan.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 lg:px-8">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Faza Studio</span>
          </div>
          <div className="flex-1" />
          <nav className="hidden items-center gap-1 md:flex">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/harga">Harga</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/masuk">Masuk</Link>
            </Button>
          </nav>
          <Button size="sm" className="ml-2" asChild>
            <Link href="/daftar">Daftar</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 text-center lg:px-8 lg:pt-28">
        <Badge variant="secondary" className="mb-5">
          Buat konten viral dengan AI
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Ide jadi konten siap upload, dalam hitungan menit.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Script, suara, subtitle, dan video — disusun otomatis dari satu topik.
          Coba gratis, tanpa kartu kredit.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" onClick={handleCobaGratis} disabled={creating} className="gap-2">
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {creating ? "Menyiapkan…" : "Coba Gratis"}
            {!creating && <ArrowRight className="h-5 w-5" />}
          </Button>
          <Button size="lg" variant="outline" onClick={() => router.push("/harga")}>
            Lihat Harga
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </section>
{/* Masalah */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Capek bikin script tiap hari? Konten terus habis ide?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Membuat konten secara konsisten butuh waktu, ide, dan energi. Faza Studio
              mengambil alih bagian yang paling berat — riset topik, menulis skrip, hingga
              menyatukan audio dan video.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Script siap pakai di setiap kategori",
              "Suara premium bisa dipilih",
              "Subtitle otomatis presisi",
              "Render video langsung jadi",
            ].map((f) => (
              <div key={f} className="flex items-start gap-2 rounded-lg border bg-card p-4 text-sm">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cara kerja */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Cara kerjanya</h2>
          <p className="mt-3 text-muted-foreground">Tiga langkah dari ide menjadi tayang.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-xl border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm font-semibold text-muted-foreground">Langkah {i + 1}</span>
              </div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
{/* Bukti hasil */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-16 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">Contoh script yang dihasilkan</h2>
            <p className="mt-3 text-muted-foreground">
              Ini contoh nyata format output dari alur Script Faza Studio.
            </p>
          </div>
          <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
            <Quote className="h-6 w-6 text-primary" />
            <div className="mt-4 space-y-4 text-sm leading-relaxed">
              <p>
                <span className="font-semibold text-primary">[HOOK]</span> Pernah nggak kamu
                merasa sudah mencoba segalanya tapi hasilnya tetap biasa saja?
              </p>
              <p>
                <span className="font-semibold text-primary">[ISI]</span> Hari ini kita akan
                lihat satu pola sederhana yang dipakai konten viral — kenapa beberapa video
                langsung ramai sementara yang lain sepi.
              </p>
              <p>
                <span className="font-semibold text-primary">[PENUTUP]</span> Terapkan satu
                langkah ini di konten berikutnya, dan bandingkan hasilnya.
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <Button variant="outline" size="sm" onClick={handleCobaGratis} disabled={creating}>
                Buat yang serupa
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-5xl px-4 py-16 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Investasi kecil, hasil maksimal</h2>
          <p className="mt-3 text-muted-foreground">
            Mulai gratis, naikkan sesuai kebutuhan produksimu.
          </p>
        </div>
        <PricingPlans />
      </section>

      {/* CTA akhir */}
      <section className="border-t">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Siap membuat konten yang viral?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Daftar gratis, dan mulai ubah ide menjadi konten siap upload hari ini.
          </p>
          <Button size="lg" className="mt-8 gap-2" asChild>
            <Link href="/daftar">
              Daftar Gratis
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between lg:px-8">
          <span>© {new Date().getFullYear()} Faza Studio</span>
          <div className="flex gap-4">
            <Link href="/harga" className="hover:text-foreground">Harga</Link>
            <Link href="/masuk" className="hover:text-foreground">Masuk</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}