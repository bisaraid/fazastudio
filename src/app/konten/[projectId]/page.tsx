"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useProjectStore } from "@/lib/store/projectStore";
import { usePipeline } from "@/hooks/usePipeline";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { recordBehavior } from "@/lib/behavior";
import { Genre, Platform, ProjectMetadata } from "@/lib/types";
import { Sparkles, Loader2, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { ScriptCard } from "@/components/pipeline/ScriptCard";
import { AudioCard } from "@/components/pipeline/AudioCard";
import { VideoCard } from "@/components/pipeline/VideoCard";
import { CardMode } from "@/components/pipeline/PipelineCard";

// ==== Mapping niche → genre + platform + durasi default ====
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

function defaultPlatformFor(mode: string): Platform {
  return mode === "jualan" ? "shopee" : "tiktok";
}

function defaultDurationFor(mode: string, platform: Platform): number {
  if (platform === "youtube") return 180;
  if (platform === "podcast") return 600;
  if (mode === "jualan") return 60;
  return 30;
}

type StepName = "script" | "audio" | "video";

export default function ProjectEditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { currentProject, loadProjects, setCurrentProject, updateProjectSetup, updateProjectMetadata } =
    useProjectStore();
  const { progress, generateStep, previewAudio } = usePipeline();

  // ==== Pilihan audio + preview ====
  const [audioProvider, setAudioProvider] = useState<"google" | "cartesia" | "elevenlabs">("cartesia");
  const [audioSpeed, setAudioSpeed] = useState(1.0);
  const [audioEmotion, setAudioEmotion] = useState<string>("netral");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);

  const [profile, setProfile] = useState<{ mode: string; niche: string; gaya?: string; cerita?: string } | null>(null);
  const [topic, setTopic] = useState("");
  const [editOpen, setEditOpen] = useState(true);
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
        setProfile({ mode: p.layer1_mode as string, niche: p.niche_slug as string, gaya: p.gaya_key as string, cerita: p.cerita_key as string });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!profile?.niche) return;
    let cancelled = false;
    setTrendsLoading(true);
    fetch(`/api/ideas?niche=${encodeURIComponent(profile.niche)}&limit=5`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && Array.isArray(data.ideas)) setTrends(data.ideas.map((i: any) => ({ keyword: i.keyword, source: data.source })));
      })
      .catch(() => {})
      .finally(() => !cancelled && setTrendsLoading(false));
    return () => { cancelled = true; };
  }, [profile?.niche]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadProjects();
      if (cancelled) return;
      setCurrentProject(projectId);
    })();
    return () => { cancelled = true; };
  }, [projectId, loadProjects, setCurrentProject]);

  // Restore pilihan user dari metadata (persist)
  useEffect(() => {
    const m = currentProject?.metadata;
    if (!m) return;
    if (m.audioProvider) setAudioProvider(m.audioProvider);
    if (typeof m.audioSpeed === "number") setAudioSpeed(m.audioSpeed);
    if (m.audioEmotion) setAudioEmotion(m.audioEmotion);
    if (m.overridePlatform) setOverridePlatform(m.overridePlatform as Platform);
    if (typeof m.overrideDuration === "number") setOverrideDuration(m.overrideDuration);
  }, [currentProject?.id]);

  // Persist pilihan user ke metadata
  const pickAudioProvider = (v: "google" | "cartesia" | "elevenlabs") => { setAudioProvider(v); updateProjectMetadata({ audioProvider: v }); };
  const pickAudioSpeed = (v: number) => { setAudioSpeed(v); updateProjectMetadata({ audioSpeed: v }); };
  const pickAudioEmotion = (v: string) => { setAudioEmotion(v); updateProjectMetadata({ audioEmotion: v }); };
  const pickOverridePlatform = (v: Platform | null) => { setOverridePlatform(v); updateProjectMetadata({ overridePlatform: v }); };
  const pickOverrideDuration = (v: number | null) => { setOverrideDuration(v); updateProjectMetadata({ overrideDuration: v }); };

  const isRunning = progress.isRunning;
  const activePlatform: Platform = overridePlatform ?? (profile ? defaultPlatformFor(profile.mode) : "tiktok");
  const activeDuration: number = overrideDuration ?? (profile ? defaultDurationFor(profile.mode, activePlatform) : 30);
  const { greet, placeholder } = profile
    ? greetAndPlaceholder(profile.mode, profile.niche)
    : { greet: "Hai, mau bikin konten apa hari ini?", placeholder: "Ketik topik yang mau kamu buat..." };

  const projectScript = currentProject?.script;
  const projectAudio = currentProject?.audio;
  const projectSubtitle = currentProject?.subtitle;
  const projectVideo = currentProject?.video;
  const scriptHas = !!projectScript?.scenes?.length;
  const audioHas = !!projectAudio?.url;
  const videoHas = !!projectVideo?.url;
  const runningStep: StepName | null = progress.isRunning ? (progress.currentStep as StepName) : null;
  const frontier: StepName | null = videoHas ? "video" : audioHas ? "audio" : scriptHas ? "script" : null;
  const modeFor = (step: StepName, has: boolean): CardMode =>
    runningStep === step ? "active" : has ? (frontier === step ? "active" : "done") : "idle";
  const scriptMode = modeFor("script", scriptHas);
  const audioMode = modeFor("audio", audioHas);
  const videoMode = modeFor("video", videoHas);

  // Auto-scroll ke card aktif saat step berubah
  const scriptRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const ref =
      runningStep === "script" || (runningStep === null && frontier === "script") ? scriptRef
      : runningStep === "audio" || (runningStep === null && frontier === "audio") ? audioRef
      : runningStep === "video" || (runningStep === null && frontier === "video") ? videoRef
      : null;
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [runningStep, frontier]);

  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || isRunning) return;
    const mode = profile?.mode || "";
    const niche = profile?.niche || "";
    const genre = genreForNiche(mode, niche);
    await updateProjectSetup({ genre, customGenre: undefined, topic: topic.trim(), platform: activePlatform, targetDuration: activeDuration });
    await generateStep("script", projectId);
  }, [topic, isRunning, profile, activePlatform, activeDuration, updateProjectSetup, generateStep, projectId]);

  const handleRegenScript = useCallback(async () => {
    if (isRunning) return;
    recordBehavior("regen_script", projectId);
    await generateStep("script", projectId);
  }, [isRunning, projectId, generateStep]);

  const handleContinueAudio = useCallback(async () => {
    if (isRunning) return;
    recordBehavior("lanjut_script_langsung", projectId);
    await generateStep("audio", projectId, { provider: audioProvider, speed: audioSpeed, emotion: audioProvider === "cartesia" ? audioEmotion : undefined });
  }, [isRunning, projectId, generateStep, audioProvider, audioSpeed, audioEmotion]);

  const handleRegenAudio = useCallback(async () => {
    if (isRunning) return;
    recordBehavior("regen_audio", projectId);
    await generateStep("audio", projectId, { provider: audioProvider, speed: audioSpeed, emotion: audioProvider === "cartesia" ? audioEmotion : undefined });
  }, [isRunning, projectId, generateStep, audioProvider, audioSpeed, audioEmotion]);

  const handleContinueVideo = useCallback(async () => {
    if (isRunning) return;
    await generateStep("video", projectId);
  }, [isRunning, projectId, generateStep]);

  const handlePreviewAudio = useCallback(async () => {
    const hasScript = !!useProjectStore.getState().currentProject?.script;
    if (previewLoading || !hasScript) return;
    const el = previewAudioRef.current;
    if (previewUrl && el) {
      el.currentTime = 0;
      el.play().catch(() => {});
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewUrl(null);
    try {
      const url = await previewAudio(projectId, { provider: audioProvider, speed: audioSpeed, emotion: audioProvider === "cartesia" ? audioEmotion : undefined });
      if (url) setPreviewUrl(url);
      else setPreviewError("Preview tidak tersedia. Coba pilih kualitas Standar, atau daftar untuk jatah premium.");
    } catch (e: any) {
      setPreviewError(e?.message || "Preview gagal.");
    } finally {
      setPreviewLoading(false);
    }
  }, [previewLoading, previewAudio, projectId, audioProvider, audioSpeed, audioEmotion, previewUrl]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-3xl px-4 py-8 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{greet}</h1>
          <p className="text-sm text-muted-foreground">Tulis satu hal, sisanya kami yang kerjakan.</p>
        </div>

        {/* Panel edit topik/pengaturan — selalu tersedia */}
        <div className="rounded-xl border bg-card">
          <button type="button" onClick={() => setEditOpen(!editOpen)} className="flex w-full items-center justify-between p-4 text-left">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Pencil className="h-4 w-4 text-muted-foreground" />
              {editOpen ? "Pengaturan konten" : "Edit topik & pengaturan"}
            </span>
            <span className="text-muted-foreground">{editOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
          </button>
          {editOpen && (
            <div className="space-y-4 border-t p-4">
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={placeholder}
                rows={4}
                className="w-full resize-none rounded-xl border bg-card px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />

              {(trends.length > 0 || trendsLoading) && (
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {trendsLoading ? "Mencari topik yang lagi naik..." : trends[0]?.source === "ai_fallback" ? "Topik yang lagi naik:" : "Lagi banyak dicari hari ini:"}
                  </p>
                  {!trendsLoading && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {trends.map((t, i) => (
                          <button key={i} onClick={() => setTopic(t.keyword)} className="rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-primary hover:bg-accent">{t.keyword}</button>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {trends[0]?.source === "ai_fallback" ? "Saran topik dari AI (sumber video belum tersedia sekarang)." : "Berdasarkan video yang sedang populer di Indonesia. Klik untuk langsung isi topik."}
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Platform</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(PLATFORM_LABEL) as Platform[]).map((pl) => (
                      <button key={pl} onClick={() => pickOverridePlatform(pl)} className={`rounded-full border px-3 py-1.5 text-sm ${activePlatform === pl ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{PLATFORM_LABEL[pl]}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Durasi</p>
                  <div className="flex flex-wrap gap-2">
                    {[15, 30, 60, 90, 180].map((d) => (
                      <button key={d} onClick={() => { pickOverrideDuration(d); recordBehavior("ganti_durasi", projectId); }} className={`rounded-full border px-3 py-1.5 text-sm ${activeDuration === d ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{d === 180 ? "3 menit" : `${d} detik`}</button>
                    ))}
                  </div>
                </div>
              </div>

              <Button onClick={handleGenerate} disabled={!topic.trim() || isRunning} className="w-full h-14 rounded-xl text-base gap-2">
                {isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                {isRunning ? "Mengerjakan..." : scriptHas ? "Ulangi Script" : "Generate"}
              </Button>
            </div>
          )}
        </div>

        {/* PROGRESS live */}
        {isRunning && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>{progress.statusMessage || "Mengerjakan..."}</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress.progress}%` }} />
            </div>
          </div>
        )}

        {progress.error && !isRunning && (
          <div className="mt-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{progress.error}</p>
          </div>
        )}

        {/* Kartu step pipeline */}
        <div className="mt-6 space-y-5">
          <div ref={scriptRef}>
            <ScriptCard
              mode={scriptMode}
              script={projectScript}
              audioProvider={audioProvider}
              onAudioProvider={pickAudioProvider}
              audioSpeed={audioSpeed}
              onAudioSpeed={pickAudioSpeed}
              audioEmotion={audioEmotion}
              onAudioEmotion={pickAudioEmotion}
              previewUrl={previewUrl}
              previewLoading={previewLoading}
              previewError={previewError}
              previewRef={previewAudioRef}
              onPreview={handlePreviewAudio}
              onContinueAudio={handleContinueAudio}
              onRegenScript={handleRegenScript}
              disabled={isRunning}
              running={progress.isRunning && progress.currentStep === "script"}
              progress={progress.progress}
              statusMessage={progress.statusMessage}
            />
          </div>

          <div ref={audioRef}>
            <AudioCard
              mode={audioMode}
              audio={projectAudio}
              onContinueVideo={handleContinueVideo}
              onRegenAudio={handleRegenAudio}
              disabled={isRunning}
              running={progress.isRunning && progress.currentStep === "audio"}
              progress={progress.progress}
              statusMessage={progress.statusMessage}
            />
          </div>

          <div ref={videoRef}>
            <VideoCard
              mode={videoMode}
              video={projectVideo}
              audioUrl={projectAudio?.url}
              srtContent={projectSubtitle?.srtContent}
              vttContent={projectSubtitle?.vttContent || projectSubtitle?.srtContent}
              running={progress.isRunning && progress.currentStep === "video"}
              progress={progress.progress}
              statusMessage={progress.statusMessage}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
