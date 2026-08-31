"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useProjectStore } from "@/lib/store/projectStore";
import { usePipeline } from "@/hooks/usePipeline";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { recordBehavior } from "@/lib/behavior";
import { Genre, Platform } from "@/lib/types";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  RefreshCw,
  ArrowDown,
  Download,
  Pencil,
  ChevronDown,
} from "lucide-react";

// ============================================================
// Mapping niche (profiling) → genre ACS + platform default
// ============================================================

/** Genre ACS yang dipakai generate (categoryId engine). */
function genreForNiche(mode: string, niche: string): Genre {
  if (mode === "jualan") return "affiliate";
  switch (niche) {
    case "mistis": return "horor";
    case "motivasi": return "motivasi";
    case "edukasi": return "edukasi";
    case "keuangan": return "keuangan";
    case "curhat": return "romance";
    case "sejarah": return "sejarah";
    default: return "edukasi";
  }
}

const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  reels: "Instagram Reels",
  podcast: "Podcast",
  shopee: "Shopee Video",
};

/** Sapaan & placeholder dinamis per profil. */
function greetAndPlaceholder(mode: string, niche: string): { greet: string; placeholder: string } {
  if (mode === "jualan") {
    const map: Record<string, string> = {
      skincare: "Ketik nama produk skincare yang mau kamu review...",
      fashion: "Ketik produk fashion yang mau kamu tampilkan...",
      gadget: "Ketik gadget yang mau kamu promosiin...",
      makanan: "Ketik menu/makanan yang mau kamu ulas...",
      suplemen: "Ketik suplemen yang mau kamu bahas...",
      perabot: "Ketik produk rumah yang mau kamu rekomendasiin...",
    };
    return {
      greet: `Hai, mau bikin konten ${niche || "produk"} apa hari ini?`,
      placeholder: map[niche] || "Ketik nama produk yang mau kamu review...",
    };
  }
  const map: Record<string, string> = {
    mistis: "Ketik judul cerita atau topik mistis kamu...",
    motivasi: "Ketik tema motivasi yang mau kamu bahas...",
    edukasi: "Ketik topik edukasi yang mau kamu jelasin...",
    keuangan: "Ketik topik keuangan yang mau kamu bahas...",
    curhat: "Ketik cerita/topik relationship yang mau kamu bagikan...",
    sejarah: "Ketik peristiwa sejarah atau fakta yang mau diceritain...",
  };
  return {
    greet: `Hai, mau bikin konten ${niche || ""} apa hari ini?`,
    placeholder: map[niche] || "Ketik topik yang mau kamu buat...",
  };
}

/** Platform default dari profil: jualan → Shopee Video, konten → TikTok. */
function defaultPlatformFor(mode: string): Platform {
  return mode === "jualan" ? "shopee" : "tiktok";
}

/** Durasi default dari profil & niche: jualan lebih panjang (review produk). */
function defaultDurationFor(mode: string, platform: Platform): number {
  if (platform === "youtube") return 180;
  if (platform === "podcast") return 600;
  // Jualan (affiliate/review produk) butuh waktu lebih untuk narasi manfaat.
  if (mode === "jualan") return 60;
  return 30;
}

export default function ProjectEditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { currentProject, loadProjects, setCurrentProject, updateProjectSetup } = useProjectStore();
  const { progress, generateStep } = usePipeline();

  const [profile, setProfile] = useState<{ mode: string; niche: string; gaya?: string; cerita?: string } | null>(null);
  const [topic, setTopic] = useState("");
  const [override, setOverride] = useState(false);
  const [overridePlatform, setOverridePlatform] = useState<Platform | null>(null);
  const [overrideDuration, setOverrideDuration] = useState<number | null>(null);
  const [trends, setTrends] = useState<{ keyword: string; source: string }[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success || !data?.data) return;
        const p = data.data;
        setProfile({
          mode: p.layer1_mode as string,
          niche: p.niche_slug as string,
          gaya: p.gaya_key as string,
          cerita: p.cerita_key as string,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch topik yang lagi banyak dicari (Google Trends / YouTube) per niche user.
  useEffect(() => {
    if (!profile?.niche) return;
    let cancelled = false;
    setTrendsLoading(true);
    fetch(`/api/ideas?niche=${encodeURIComponent(profile.niche)}&limit=5`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && Array.isArray(data.ideas)) {
          setTrends(data.ideas.map((i: any) => ({ keyword: i.keyword, source: data.source })));
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setTrendsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [profile?.niche]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadProjects();
      if (cancelled) return;
      setCurrentProject(projectId);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadProjects, setCurrentProject]);
const isRunning = progress.isRunning;
  const activePlatform: Platform = overridePlatform ?? (profile ? defaultPlatformFor(profile.mode) : "tiktok");
  const activeDuration: number = overrideDuration ?? (profile ? defaultDurationFor(profile.mode, activePlatform) : 30);

  const { greet, placeholder } = profile
    ? greetAndPlaceholder(profile.mode, profile.niche)
    : { greet: "Hai, mau bikin konten apa hari ini?", placeholder: "Ketik topik yang mau kamu buat..." };

  const projectScript = currentProject?.script;
  const projectAudio = currentProject?.audio;
  const projectVideo = currentProject?.video;

  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || isRunning) return;
    const mode = profile?.mode || "";
    const niche = profile?.niche || "";
    const genre = genreForNiche(mode, niche);
    await updateProjectSetup({
      genre,
      customGenre: undefined,
      topic: topic.trim(),
      platform: activePlatform,
      targetDuration: activeDuration,
    });
    await generateStep("script", projectId);
  }, [topic, isRunning, profile, activePlatform, activeDuration, updateProjectSetup, generateStep, projectId]);

  const handleRegenScript = useCallback(async () => {
    if (isRunning) return;
    recordBehavior("regen_script", projectId); // fire-and-forget
    await generateStep("script", projectId);
  }, [isRunning, projectId, generateStep]);

  const handleContinueAudio = useCallback(async () => {
    if (isRunning) return;
    recordBehavior("lanjut_script_langsung", projectId); // sinyal positif: straight ke audio tanpa edit
    await generateStep("audio", projectId);
  }, [isRunning, projectId, generateStep]);

  const handleRegenAudio = useCallback(async () => {
    if (isRunning) return;
    recordBehavior("regen_audio", projectId);
    await generateStep("audio", projectId);
  }, [isRunning, projectId, generateStep]);

  const handleContinueVideo = useCallback(async () => {
    if (isRunning) return;
    await generateStep("video", projectId);
  }, [isRunning, projectId, generateStep]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-3xl px-4 py-8 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{greet}</h1>
          <p className="text-sm text-muted-foreground">Tulis satu hal, sisanya kami yang kerjakan.</p>
        </div>

        {/* Input + Generate (tampil jika belum ada script) */}
        {!projectScript && (
          <div className="space-y-4">
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={placeholder}
              rows={4}
              className="w-full resize-none rounded-xl border bg-card px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {/* Saran topik yang lagi banyak dicari (di bawah input box) */}
            {(trends.length > 0 || trendsLoading) && (
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {trendsLoading
                    ? "Mencari topik yang lagi naik..."
                    : trends[0]?.source === "ai_fallback"
                      ? "Topik yang lagi naik:"
                      : "Lagi banyak dicari hari ini:"}
                </p>
                {!trendsLoading && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {trends.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => setTopic(t.keyword)}
                          className="rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-primary hover:bg-accent"
                        >
                          {t.keyword}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {trends[0]?.source === "ai_fallback"
                        ? "Saran topik dari AI (sumber video belum tersedia sekarang)."
                        : "Berdasarkan video yang sedang populer di Indonesia. Klik untuk langsung isi topik."}
                    </p>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <button
                onClick={() => setOverride((v) => !v)}
                className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
                {PLATFORM_LABEL[activePlatform]} · {activeDuration} detik · {profile?.niche || "Topik"}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {override && (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Platform</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setOverridePlatform(p)}
                        className={`rounded-full border px-3 py-1.5 text-sm ${
                          activePlatform === p ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                        }`}
                      >
                        {PLATFORM_LABEL[p]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Durasi</p>
                  <div className="flex flex-wrap gap-2">
                    {[15, 30, 60, 90].map((d) => (
                      <button
                        key={d}
                        onClick={() => {
                          setOverrideDuration(d);
                          recordBehavior("ganti_durasi", projectId);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-sm ${
                          activeDuration === d ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                        }`}
                      >
                        {d} detik
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={!topic.trim() || isRunning}
              className="w-full h-14 rounded-xl text-base gap-2"
            >
              {isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              {isRunning ? "Mengerjakan..." : "Generate"}
            </Button>
          </div>
        )}
{/* PROGRESS STATUS (live) */}
        {isRunning && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>{progress.statusMessage || "Mengerjakan..."}</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* HASIL — flow vertikal chat-like */}
        <div className="mt-6 space-y-5">
          {/* SCRIPT */}
          {projectScript && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Script siap
                  </Badge>
                </div>
                <div className="max-h-72 overflow-y-auto rounded-lg bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {projectScript.fullScript}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleContinueAudio} disabled={isRunning} className="gap-1.5">
                    <ArrowDown className="h-4 w-4" /> Lanjut ke Audio
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleRegenScript} disabled={isRunning} className="gap-1.5">
                    <RefreshCw className="h-4 w-4" /> Ulangi Script
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AUDIO */}
          {projectAudio?.url && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Audio siap
                  </Badge>
                </div>
                <audio controls src={projectAudio.url} className="w-full" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleContinueVideo} disabled={isRunning} className="gap-1.5">
                    <ArrowDown className="h-4 w-4" /> Lanjut ke Video
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleRegenAudio} disabled={isRunning} className="gap-1.5">
                    <RefreshCw className="h-4 w-4" /> Ulangi Audio
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* VIDEO */}
          {projectVideo?.url && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Video siap
                  </Badge>
                </div>
                <video controls src={projectVideo.url} className="w-full rounded-xl" />
                <div className="flex gap-2">
                  {projectAudio?.url && (
                    <a href={projectAudio.url} download className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-4 py-2 text-sm hover:bg-accent">
                      <Download className="h-4 w-4" /> Download Audio
                    </a>
                  )}
                  <a href={projectVideo.url} download className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
                    <Download className="h-4 w-4" /> Download Video
                  </a>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}