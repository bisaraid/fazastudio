"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LAYER1_OPTIONS,
  NICHES,
  GAYA_BY_NICHE,
  getCeritaOptions,
} from "@/lib/persona-data";
import { NicheOption } from "@/lib/persona-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Check, ChevronLeft } from "lucide-react";

function MulaiForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/beranda";

  const [mode, setMode] = useState<string>("");
  const [niche, setNiche] = useState<string>("");
  const [gaya, setGaya] = useState<string>("");
  const [cerita, setCerita] = useState<string>("");

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Animasi: `anim` = sedang slide. `dir` = +1 maju, -1 mundur.
  const [anim, setAnim] = useState(false);
  const [dir, setDir] = useState(1);
  const [ack, setAck] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const nicheOptions = mode ? NICHES[mode as keyof typeof NICHES] ?? [] : [];
  const gayaOptions = niche ? GAYA_BY_NICHE[niche] ?? [] : [];
  const ceritaOptions = niche && gaya ? getCeritaOptions(niche, gaya) : [];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success || !data?.data) return;
        const p = data.data;
        if (p.layer1_mode) setMode(p.layer1_mode);
        if (p.niche_slug) setNiche(p.niche_slug);
        if (p.gaya_key) setGaya(p.gaya_key);
        if (p.cerita_key) setCerita(p.cerita_key);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const clearTimers = () => timers.current.forEach(clearTimeout);

  /** Tampilkan acknowledgment singkat lalu maju/mundur step. */
  const doTransition = (dirNext: number, ackText: string | null, nextStep: number) => {
    clearTimers();
    setAck(ackText);
    setDir(dirNext);
    setAnim(true); // slide out (ke kiri utk maju, kanan utk mundur)
    const t1 = setTimeout(() => {
      setStep(nextStep);
      setAck(null);
    }, 250);
    const t2 = setTimeout(() => setAnim(false), 380); // slide in yang baru
    timers.current.push(t1, t2);
  };

  /** Layer 1-3: pilih opsi → ack → pindah ke step berikutnya. */
  const selectLayer = (
    set: (v: string) => void,
    val: string,
    ackText: string,
    nextStep: number
  ) => {
    if (anim || saving) return;
    set(val);
    doTransition(1, ackText, nextStep);
  };

  /** Layer 4: pilih → simpan & redirect (setelah slide-out). */
  const selectFinal = (val: string, ackText: string) => {
    if (anim || saving) return;
    setCerita(val);
    clearTimers();
    setAck(ackText);
    setDir(1);
    setAnim(true);
    const t = setTimeout(() => {
      handleSave({ cerita: val });
    }, 350);
    timers.current.push(t);
  };

  const handleBack = () => {
    if (anim || saving || step <= 1) return;
    doTransition(-1, null, step - 1);
  };

  const handleSave = async (override?: { cerita?: string }) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layer1Mode: mode,
          nicheSlug: niche,
          gayaKey: gaya,
          ceritaKey: override?.cerita ?? cerita,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Gagal menyimpan preferensi.");
      }
      router.push(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
      setAnim(false);
      setSaving(false);
    }
  };

  // Acknowledgment singkat untuk opsi tertentu (sesuai kebutuhan).
  const ackLabels: Record<string, string> = {
    jualan: "Oke, kamu jualan produk 👍",
    konten: "Bikin konten, mantap!",
    skincare: "Skincare, siap!",
    fashion: "Fashion, gas!",
    gadget: "Gadget, oke!",
    makanan: "Makanan, bikin ngiler!",
    suplemen: "Suplemen, sehat!",
    perabot: "Rumah, cozy!",
    mistis: "Mistis, merinding!",
    motivasi: "Motivasi, semangat!",
    edukasi: "Edukasi, belajar!",
    keuangan: "Keuangan, mantap!",
    curhat: "Curhat, relate!",
    sejarah: "Sejarah, seru!",
  };

  const progress = ((step - 1) / 4) * 100 + (step === 4 && !anim ? 100 : 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl px-4 py-12 lg:px-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Personalisasi gaya kamu</h1>
        </div>
        {/* Progress bar */}
        <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-in-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Konten step — transisi slide */}
        <div
          className={`transition-all duration-300 ease-in-out ${
            anim
              ? dir > 0
                ? "-translate-x-8 opacity-0"
                : "translate-x-8 opacity-0"
              : dir < 0
              ? "translate-x-8 opacity-0"
              : "translate-x-0 opacity-100"
          }`}
        >
          {/* STEP 1 — Tujuan */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Kamu bikin konten buat apa?</CardTitle>
                <CardDescription>Pilih satu.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {LAYER1_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => selectLayer(setMode, o.key, ackLabels[o.key] ?? "", 2)}
                    className={`w-full rounded-lg border p-4 text-left transition-all duration-200 ${
                      mode === o.key
                        ? "scale-[1.03] border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{o.label}</div>
                        <div className="text-sm text-muted-foreground">{o.desc}</div>
                      </div>
                      {mode === o.key && <Check className="h-5 w-5 text-primary" />}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* STEP 2 — Niche */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pilih niche kamu</CardTitle>
                <CardDescription>Pilih satu.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {nicheOptions.map((n: NicheOption) => (
                  <button
                    key={n.slug}
                    onClick={() => {
                      setNiche(n.slug);
                      setGaya("");
                      setCerita("");
                      selectLayer(setNiche, n.slug, ackLabels[n.slug] ?? "", 3);
                    }}
                    className={`rounded-lg border p-3 text-left text-sm transition-all duration-200 ${
                      niche === n.slug
                        ? "scale-[1.03] border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-accent"
                    }`}
                  >
                    <div className="font-medium">{n.label}</div>
                  </button>
                ))}
                {nicheOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">Pilih tujuan dulu di langkah 1.</p>
                )}
              </CardContent>
            </Card>
          )}
{/* STEP 3 — Gaya */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gaya ngomong yang kamu suka?</CardTitle>
                <CardDescription>Pilih satu.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {gayaOptions.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => {
                      setGaya(g.key);
                      setCerita("");
                      selectLayer(setGaya, g.key, "Cocok! ✨", 4);
                    }}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition-all duration-200 ${
                      gaya === g.key
                        ? "scale-[1.03] border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-accent"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
                {gayaOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">Pilih niche dulu di langkah 2.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 4 — Cara Cerita */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cara cerita yang kamu mau?</CardTitle>
                <CardDescription>Pilih satu yang paling pas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {ceritaOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => selectFinal(opt.key, "Siap! 🚀")}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition-all duration-200 ${
                      cerita === opt.key
                        ? "scale-[1.03] border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                {ceritaOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">Pilih gaya dulu di langkah 3.</p>
                )}
              </CardContent>
            </Card>
          )}

          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        </div>

        {/* Acknowledgment singkat */}
        {ack && !saving && (
          <div className="mt-4 text-center text-sm font-medium text-primary animate-in fade-in">
            {ack}
          </div>
        )}

        {/* Kembali */}
        <div className="mt-4 flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button variant="ghost" onClick={handleBack} disabled={anim || saving}>
              <ChevronLeft className="h-4 w-4" /> Kembali
            </Button>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  );
}

export default function MulaiPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
          Memuat…
        </div>
      }
    >
      <MulaiForm />
    </Suspense>
  );
}