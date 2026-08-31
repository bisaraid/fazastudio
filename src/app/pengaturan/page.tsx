"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Pencil, Sparkles, CreditCard, LogOut, Save, X } from "lucide-react";
import {
  LAYER1_OPTIONS,
  NICHES,
  GAYA_BY_NICHE,
  getCeritaOptions,
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

function ceritaLabel(niche: string, gaya: string, cerita: string): string {
  return getCeritaOptions(niche, gaya).find((c) => c.key === cerita)?.label ?? cerita;
}

/** Apakah gaya lama masih tersedia untuk niche baru? */
function gayaValidFor(niche: string, gaya: string): boolean {
  return !!gaya && (GAYA_BY_NICHE[niche] ?? []).some((g) => g.key === gaya);
}

/** Apakah cerita lama masih tersedia untuk (niche, gaya) baru? */
function ceritaValidFor(niche: string, gaya: string, cerita: string): boolean {
  return !!cerita && !!gaya && getCeritaOptions(niche, gaya).some((c) => c.key === cerita);
}

export default function PengaturanPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [mode, setMode] = useState("");
  const [niche, setNiche] = useState("");
  const [gaya, setGaya] = useState("");
  const [cerita, setCerita] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.success && data?.data) {
          const p = data.data;
          setProfile(p);
          setMode(p.layer1_mode || "");
          setNiche(p.niche_slug || "");
          setGaya(p.gaya_key || "");
          setCerita(p.cerita_key || "");
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const startEdit = () => {
    setSaveError(null);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    if (profile) {
      setMode(profile.layer1_mode || "");
      setNiche(profile.niche_slug || "");
      setGaya(profile.gaya_key || "");
      setCerita(profile.cerita_key || "");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layer1Mode: mode,
          nicheSlug: niche,
          gayaKey: gaya,
          ceritaKey: cerita,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || "Gagal menyimpan profil");
      }
      const updated = {
        ...(profile || {}),
        layer1_mode: mode,
        niche_slug: niche,
        gaya_key: gaya,
        cerita_key: cerita,
      } as Profile;
      setProfile(updated);
      setIsEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Gagal menyimpan profil");
    } finally {
      setSaving(false);
    }
  };

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

  // Opsi untuk edit
  const nicheOptions = mode ? NICHES[mode as keyof typeof NICHES] ?? [] : [];
  const gayaOptions = niche ? GAYA_BY_NICHE[niche] ?? [] : [];
  const ceritaOptions = niche && gaya ? getCeritaOptions(niche, gaya) : [];

  // Guided rebuild persona: selagi ada "?" yang belum dilengkapi dan Simpan
  // dinonaktifkan. Rebuild selesai bila semua field valid (rebuildPending = none).
  const [rebuildPending, setRebuildPending] = useState<"none" | "gaya" | "cerita">("none");

  // Validasi: pastikan gaya & cerita cocok dgn (niche, gaya). Reset yang invalid,
  // tandai langkah berikutnya yang perlu dipilih user.
  const syncPersona = (n: string, g: string, c: string) => {
    if (!n || !g) {
      setGaya("");
      setCerita("");
      setRebuildPending(n ? "gaya" : "none");
      return;
    }
    if (!gayaValidFor(n, g)) {
      setGaya("");
      setCerita("");
      setRebuildPending("gaya");
      return;
    }
    if (!ceritaValidFor(n, g, c)) {
      setCerita("");
      setRebuildPending("cerita");
      return;
    }
    setRebuildPending("none");
  };

  const handleModeChange = (m: string) => {
    setMode(m);
    const opts = NICHES[m as keyof typeof NICHES] ?? [];
    if (!niche || !opts.some((x) => x.slug === niche)) {
      // niche lama tak ada di mode baru → mulai dari niche
      setNiche("");
      setGaya("");
      setCerita("");
      setRebuildPending("none");
    } else {
      syncPersona(niche, gaya, cerita);
    }
  };

  const handleNicheChange = (n: string) => {
    setNiche(n);
    syncPersona(n, gaya, cerita);
  };

  const handleGayaChange = (g: string) => {
    setGaya(g);
    syncPersona(niche, g, cerita);
  };

  const handleCeritaChange = (c: string) => {
    setCerita(c);
    syncPersona(niche, gaya, c);
  };

  const canSave = !!mode && !!niche && !!gaya && !!cerita && rebuildPending === "none";
return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-3xl px-4 py-8 lg:px-8">
        <div className="mb-8 flex items-center gap-3">
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
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" /> Profil Konten
            </CardTitle>
            <CardDescription>
              Gaya konten yang kami pakai saat generate untuk kamu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Memuat profil...</p>
            ) : isEditing ? (
              <EditFields
                mode={mode}
                setMode={handleModeChange}
                niche={niche}
                setNiche={handleNicheChange}
                gaya={gaya}
                setGaya={handleGayaChange}
                cerita={cerita}
                setCerita={handleCeritaChange}
                nicheOptions={nicheOptions}
                gayaOptions={gayaOptions}
                ceritaOptions={ceritaOptions}
                rebuildPending={rebuildPending}
              />
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
                    <p className="font-medium">{ceritaLabel(profile.niche_slug, profile.gaya_key, profile.cerita_key)}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Profil belum lengkap. Selesaikan personalisasi dulu.
              </p>
            )}

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button onClick={handleSave} disabled={saving || !canSave} className="gap-1.5">
                    {saving ? "Menyimpan..." : "Simpan"}
                    {!saving && <Save className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" onClick={cancelEdit} disabled={saving} className="gap-1.5">
                    <X className="h-4 w-4" /> Batal
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={startEdit} className="gap-1.5">
                  <Pencil className="h-4 w-4" /> Ubah Profil
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* AKUN */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Akun</CardTitle>
            <CardDescription>Keluar dari perangkat ini.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="ghost"
              className="gap-1.5 text-destructive"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              <LogOut className="h-4 w-4" /> {loggingOut ? "Keluar..." : "Keluar"}
            </Button>
          </CardContent>
        </Card>

        {/* BILLING / PLAN */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-primary" /> Paket &amp; Kredit
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
function EditFields({
  mode,
  setMode,
  niche,
  setNiche,
  gaya,
  setGaya,
  cerita,
  setCerita,
  nicheOptions,
  gayaOptions,
  ceritaOptions,
  rebuildPending,
}: {
  mode: string;
  setMode: (v: string) => void;
  niche: string;
  setNiche: (v: string) => void;
  gaya: string;
  setGaya: (v: string) => void;
  cerita: string;
  setCerita: (v: string) => void;
  nicheOptions: { slug: string; label: string }[];
  gayaOptions: { key: string; label: string }[];
  ceritaOptions: { key: string; label: string }[];
  rebuildPending: "none" | "gaya" | "cerita";
}) {
  const nicheNow = nicheLabel(niche);
  return (
    <div className="space-y-5">
      {/* Tujuan */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tujuan</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="" disabled>
            Pilih tujuan
          </option>
          {LAYER1_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Niche */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Niche</label>
        <select
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="" disabled>
            {mode ? "Pilih niche" : "Pilih tujuan dulu"}
          </option>
          {nicheOptions.map((n) => (
            <option key={n.slug} value={n.slug}>
              {n.label}
            </option>
          ))}
        </select>
      </div>

      {/* Gaya ngomong */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {rebuildPending === "gaya"
            ? `Pilih gaya ngomong untuk ${nicheNow}:`
            : "Gaya ngomong"}
        </label>
        <select
          value={gaya}
          onChange={(e) => setGaya(e.target.value)}
          className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="" disabled>
            {rebuildPending === "gaya" ? "Pilih salah satu" : niche ? "Pilih gaya" : "Pilih niche dulu"}
          </option>
          {gayaOptions.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      {/* Cara cerita */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {rebuildPending === "cerita" ? "Pilih cara cerita:" : "Cara cerita"}
        </label>
        <select
          value={cerita}
          onChange={(e) => setCerita(e.target.value)}
          disabled={rebuildPending !== "cerita" && !gaya}
          className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="" disabled>
            {rebuildPending === "cerita" ? "Pilih salah satu" : gaya ? "Pilih cara cerita" : "Pilih gaya dulu"}
          </option>
          {ceritaOptions.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {rebuildPending !== "none" && (
        <p className="text-xs text-muted-foreground">
          Lengkapi pilihan di atas supaya gaya script-mu tetap personal. Tombol Simpan aktif
          otomatis setelah selesai.
        </p>
      )}
    </div>
  );
}