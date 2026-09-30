"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  LAYER1_OPTIONS,
  NICHES,
  GAYA_BY_NICHE,
  getCeritaOptions,
} from "@/lib/persona-data";
import { NicheOption } from "@/lib/persona-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Check, ChevronLeft, ChevronRight, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { track } from "@/lib/posthog";
import {
  isOnboardingComplete,
  navigateTo,
  normalizeNextPath,
  personaFromProfile,
  savePersona,
  type PersonaAnswers,
} from "@/lib/onboarding";

function MulaiForm() {
  const searchParams = useSearchParams();
  // `next` dinormalkan: tidak boleh kembali ke /mulai (loop tak berujung) atau
  // keluar origin (open-redirect). Lihat src/lib/onboarding.ts.
  const next = normalizeNextPath(searchParams.get("next"));

  const [mode, setMode] = useState<string>("");
  const [niche, setNiche] = useState<string>("");
  const [gaya, setGaya] = useState<string>("");
  const [cerita, setCerita] = useState<string>("");

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Profil di server sudah lengkap (user lama / sudah berplan) → sediakan jalan
  // keluar langsung, tanpa memaksa mengulang 4 langkah.
  const [profileComplete, setProfileComplete] = useState(false);
  // Guard sinkron: cegah klik ganda "Simpan" (state React belum tentu ter-flush).
  const savingRef = useRef(false);

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
        const persona = personaFromProfile(data.data);
        if (persona.mode) setMode(persona.mode);
        if (persona.niche) setNiche(persona.niche);
        if (persona.gaya) setGaya(persona.gaya);
        if (persona.cerita) setCerita(persona.cerita);
        setProfileComplete(isOnboardingComplete(persona));
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

  /** Keluar dari wizard dengan navigasi KERAS (lihat navigateTo). */
  const goToNext = () => {
    clearTimers();
    navigateTo(next);
  };

  /** Layer 4: pilih → ack singkat. Simpan dilakukan tombol "Simpan & lanjut". */
  const selectCerita = (val: string, ackText: string) => {
    if (anim || saving) return;
    setCerita(val);
    clearTimers();
    setAck(ackText);
    setDir(1);
    setAnim(true);
    const t = setTimeout(() => setAnim(false), 380);
    timers.current.push(t);
  };

  const handleBack = () => {
    if (anim || saving || step <= 1) return;
    doTransition(-1, null, step - 1);
  };

  /** Langkah 1-3: tombol Lanjut manual — setiap langkah selalu punya jalan maju. */
  const handleNext = () => {
    if (anim || saving || step >= 4) return;
    const choice = step === 1 ? mode : step === 2 ? niche : gaya;
    if (!choice) return;
    doTransition(1, ackLabels[choice] ?? "", step + 1);
  };

  /**
   * Simpan persona. Selalu berakhir jelas: sukses → keluar dari wizard, gagal →
   * pesan error yang TERLIHAT + tombol "Coba lagi"/"Lanjut tanpa menyimpan".
   *
   * `saving` dijamin di-reset di semua jalur. Sebelumnya jalur sukses tidak
   * me-reset `saving`, sehingga semua tombol (termasuk Kembali) tetap disabled
   * dan user terkunci di layar "Profil kamu siap!".
   */
  const handleSave = async () => {
    if (savingRef.current) return;
    const answers: PersonaAnswers = { mode, niche, gaya, cerita };

    if (!isOnboardingComplete(answers)) {
      setError("Lengkapi dulu semua langkah: tujuan, niche, gaya, dan cara cerita.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    const result = await savePersona(answers);

    savingRef.current = false;
    setSaving(false);

    if (!result.ok) {
      setAnim(false);
      setError(result.error);
      return;
    }

    setSaved(true);
    track("user_signup", { mode, niche, gaya, cerita });
    // Jeda singkat agar pesan sukses terbaca, lalu keluar. Tombol
    // "Lanjut ke Beranda" tetap tersedia sebagai jalan keluar manual bila
    // navigasi otomatis tidak terjadi (mis. halaman ini di-render ulang).
    const t = setTimeout(() => goToNext(), 800);
    timers.current.push(t);
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

  const progress = (step / 4) * 100;

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
                    onClick={() => selectCerita(opt.key, "Siap! 🚀")}
                    disabled={saving}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                      cerita === opt.key
                        ? "scale-[1.03] border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-accent"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      {opt.label}
                    </span>
                  </button>
                ))}
                {ceritaOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">Pilih gaya dulu di langkah 3.</p>
                )}
              </CardContent>
            </Card>
          )}

        </div>

        {/* Acknowledgment singkat */}
        {ack && (
          <div className="mt-4 text-center text-sm font-medium text-primary animate-in fade-in">
            {ack}
          </div>
        )}

        {/* Profil di server sudah lengkap (user lama / sudah berplan) →
            jalan keluar langsung, tanpa memaksa mengulang 4 langkah. */}
        {loaded && profileComplete && !saved && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">
              Profil kamu sudah lengkap. Kamu bisa langsung masuk.
            </p>
            <Button size="sm" variant="outline" onClick={goToNext}>
              Lanjut ke Beranda <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Sukses: pesan + tombol keluar MANUAL (anti-jebakan bila navigasi
            otomatis tidak terjadi karena cache/redirect). */}
        {saved && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
            <p className="text-sm font-medium text-primary">Profil kamu siap! 🎉</p>
            <Button size="sm" className="mt-2" onClick={goToNext}>
              Lanjut ke Beranda <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Gagal simpan: pesan yang TERLIHAT + coba lagi + tetap boleh lanjut. */}
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
          >
            <p className="text-sm font-medium text-destructive">Gagal menyimpan profil</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                Coba lagi
              </Button>
              <Button size="sm" variant="ghost" onClick={goToNext}>
                Lanjut tanpa menyimpan <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Kalau lanjut tanpa menyimpan, pilihan kamu belum tersimpan dan halaman ini bisa
              muncul lagi.
            </p>
          </div>
        )}

        {/* Navigasi — SETIAP langkah selalu punya jalan keluar. */}
        <div className="mt-4 flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button variant="ghost" onClick={handleBack} disabled={anim || saving}>
              <ChevronLeft className="h-4 w-4" /> Kembali
            </Button>
          ) : (
            <span />
          )}

          {step < 4 ? (
            <Button
              onClick={handleNext}
              disabled={anim || saving || !(step === 1 ? mode : step === 2 ? niche : gaya)}
            >
              Lanjut <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : saved ? (
            <Button onClick={goToNext}>
              Lanjut ke Beranda <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving || !cerita}>
              {saving ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Menyimpan…
                </>
              ) : (
                <>
                  Simpan &amp; lanjut <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
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