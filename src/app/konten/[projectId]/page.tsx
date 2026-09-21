"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useProjectStore } from "@/lib/store/projectStore";
import { usePipeline } from "@/hooks/usePipeline";
import { useUser } from "@/hooks/useUser";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { recordBehavior } from "@/lib/behavior";
import { readPreferences, recordPreference } from "@/lib/preferences";
import { GAYA_BY_NICHE, getCeritaOptions } from "@/lib/persona-data";
import { Genre, Platform } from "@/lib/types";
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

function gayaLabel(niche: string, gaya: string): string {
  return (GAYA_BY_NICHE[niche] ?? []).find((g) => g.key === gaya)?.label ?? gaya;
}
function ceritaLabel(niche: string, gaya: string, cerita: string): string {
  return getCeritaOptions(niche, gaya).find((c) => c.key === cerita)?.label ?? cerita;
}

type StepName = "script" | "audio" | "video";

export default function ProjectEditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { currentProject, loadProjects, setCurrentProject, updateProjectSetup, updateProjectMetadata, deleteProject } =
    useProjectStore();
  const { progress, generateStep, runAutoChain, previewAudio } = usePipeline();
  const { user } = useUser();

  // ==== Pilihan audio + preview ====
  const [audioProvider, setAudioProvider] = useState<"google" | "cartesia" | "elevenlabs">("google");
  const [audioSpeed, setAudioSpeed] = useState(1.0);
  const [audioEmotion, setAudioEmotion] = useState<string>("netral");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);

  const [profile, setProfile] = useState<{ mode: string; niche: string; gaya?: string; cerita?: string } | null>(null);
  const [topic, setTopic] = useState("");
  // Guard hydrate topik: hanya sekali per project (jangan timpa ketikan user).
  const hydratedFor = useRef<string | null>(null);
  const projectLoadedRef = useRef(false);
  const [editOpen, setEditOpen] = useState(false);
  const [scriptKeepExpanded, setScriptKeepExpanded] = useState(true);
  // Gate login anonim untuk step audio.
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [limitModal, setLimitModal] = useState<any>(null);
  // Guard auto-generate script dari homepage ("Coba Gratis") — hanya sekali per project.
  const autoGeneratedRef = useRef<string | null>(null);
  const anonGateShownRef = useRef(false);
  const [overridePlatform, setOverridePlatform] = useState<Platform | null>(null);
  const [overrideDuration, setOverrideDuration] = useState<number | null>(null);
  const topicRef = useRef<HTMLTextAreaElement | null>(null);
  const overridePlatformRef = useRef<Platform | null>(null);
  const overrideDurationRef = useRef<number | null>(null);
  const [trends, setTrends] = useState<{ keyword: string; source: string }[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [deletingOldest, setDeletingOldest] = useState(false);
  const [oldestError, setOldestError] = useState<string | null>(null);

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

  // Bawa topik dari homepage ("Coba Gratis"): isi ke field topik lalu hapus.
  useEffect(() => {
    const initial =
      typeof window !== "undefined" ? window.sessionStorage.getItem("initial_topic") : null;
    if (initial != null && initial.trim()) {
      setTopic(initial.trim());
      window.sessionStorage.removeItem("initial_topic");
    }
  }, []);

  useEffect(() => {
    if (!profile?.niche) return;
    let cancelled = false;
    setTrendsLoading(true);

    // Personalized suggest dulu; kalau returned false/kosong → fallback per-niche lama.
    const fetchPerNicheFallback = () =>
      fetch(`/api/ideas?niche=${encodeURIComponent(profile.niche!)}&limit=5`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (d?.success && Array.isArray(d.ideas)) {
            setTrends(d.ideas.map((i: any) => ({ keyword: i.keyword, source: d.source })));
          }
        })
        .catch((e) => {
          console.warn("[konten] fetch ideas fallback gagal:", e);
        })
        .finally(() => !cancelled && setTrendsLoading(false));

    fetch("/api/suggest?limit=5")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && Array.isArray(data.ideas) && data.ideas.length) {
          // Personal: tampil label "Akan trending" bila sinyalnya up-coming (youtube_us).
          setTrends(
            data.ideas.map((i: any) => ({ keyword: i.keyword, source: data.source }))
          );
          return;
        }
        return fetchPerNicheFallback();
      })
      .catch(() => fetchPerNicheFallback());

    return () => { cancelled = true; };
  }, [profile?.niche]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      projectLoadedRef.current = false;
      await loadProjects();
      if (cancelled) return;
      setCurrentProject(projectId);
      projectLoadedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [projectId, loadProjects, setCurrentProject]);

  useEffect(function () {
    if (!currentProject) return;
    if (currentProject.id !== projectId) return;
    if (hydratedFor.current === projectId) return;
    const t = currentProject.topic?.trim();
    if (t) setTopic(t);
    hydratedFor.current = projectId;
  }, [projectId, currentProject?.id]);

  useEffect(() => {
    const hasTopic = !!(currentProject?.topic || "").trim();
    if (hasTopic) {
      setEditOpen(false);
    } else {
      setEditOpen(true);
      const id = window.setTimeout(() => topicRef.current?.focus(), 80);
      return () => window.clearTimeout(id);
    }
  }, [projectId, currentProject?.id]);

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

  // Pre-fill platform & durasi dari behavior preferences (mount + login)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    readPreferences()
      .then((prefs) => {
        if (cancelled) return;
        if (!overridePlatformRef.current && prefs.platform) {
          setOverridePlatform(prefs.platform as Platform);
        }
        if (overrideDurationRef.current == null && typeof prefs.duration === "number") {
          setOverrideDuration(prefs.duration);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    overridePlatformRef.current = overridePlatform;
  }, [overridePlatform]);
  useEffect(() => {
    overrideDurationRef.current = overrideDuration;
  }, [overrideDuration]);

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
  const isAnon = !user;
  const scriptMode: CardMode = isAnon ? "active" : runningStep === "script" ? "active" : frontier === "video" ? "done" : frontier === "audio" ? "done" : frontier === "script" ? (scriptKeepExpanded ? "active" : "done") : "active";
  const audioMode: CardMode = isAnon ? "idle" : runningStep === "audio" ? "active" : frontier === "video" ? "done" : frontier === "audio" ? "done" : frontier === "script" ? "active" : "idle";
  const videoMode: CardMode = isAnon ? "idle" : runningStep === "video" ? "active" : frontier === "video" ? "done" : frontier === "audio" ? "active" : "idle";

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

  useEffect(()=> {
    const lp = progress.limitProject;
    if (lp && lp.id) {
      setLimitModal({ id: lp.id, title: lp.title || "Project" });
    } else {
      setLimitModal(null);
    }
  }, [progress.limitProject]);
  const handleDeleteOldest = useCallback(async ()=> {
    if (!limitModal || deletingOldest) return;
    const id = limitModal.id;
    setDeletingOldest(true);
    setOldestError(null);
    try {
      await deleteProject(id);
    } catch (err) {
      setOldestError(
        err instanceof Error ? err.message : "Gagal menghapus project terlama. Coba lagi."
      );
      setDeletingOldest(false);
      return;
    }
    setLimitModal(null);
    setDeletingOldest(false);
    await handleGenerate();
  }, [limitModal, deletingOldest, deleteProject]);
  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || isRunning) return;
    const mode = profile?.mode || "";
    const niche = profile?.niche || "";
    const genre = genreForNiche(mode, niche);
    await updateProjectSetup({ genre, customGenre: undefined, topic: topic.trim(), platform: activePlatform, targetDuration: activeDuration });
    await generateStep("script", projectId);
  }, [topic, isRunning, profile, activePlatform, activeDuration, updateProjectSetup, generateStep, projectId]);

  // Auto-chain behavior-aware: per login script→audio→video automatico;
  // anonimo solo script (gate audio resta nello ScriptCard).
  const handleAutoRun = useCallback(async () => {
    if (!topic.trim() || isRunning) return;

    // Preferenze behavior (più scelto) > profilo > default tiktok/30/google.
    // Hybrid: DB untuk user login, fallback localStorage untuk anonim/gagal.
    const prefs = await readPreferences();
    const platform: Platform =
      (prefs.platform as Platform) ?? (profile ? defaultPlatformFor(profile.mode) : "tiktok");
    const targetDuration =
      prefs.duration != null
        ? prefs.duration
        : (profile ? defaultDurationFor(profile.mode, platform) : 30);
    const provider = (prefs.provider as "google" | "cartesia" | "elevenlabs") ?? "google";
    const mode = profile?.mode || "";
    const niche = profile?.niche || "";
    const genre = genreForNiche(mode, niche);

    await updateProjectSetup({ genre, customGenre: undefined, topic: topic.trim(), platform, targetDuration });

    // Anonimo: fermati a script (nessun trigger audio). Login: chain completa.
    if (!user) {
      await generateStep("script", projectId);
      return;
    }
    // Segnale behavior "lanjut langsung" registrato anche in auto (no click manuale).
    recordBehavior("lanjut_script_langsung", projectId, {
      provider: audioProvider,
      speed: audioSpeed,
      emotion: audioEmotion,
      platform: activePlatform,
      duration: activeDuration,
    });
    await runAutoChain(projectId, {
      audioOptions: {
        provider,
        speed: audioSpeed,
        emotion: provider === "cartesia" ? audioEmotion : undefined,
      },
    });
  }, [topic, isRunning, profile, user, projectId, updateProjectSetup, generateStep, runAutoChain, audioProvider, audioSpeed, audioEmotion, activePlatform, activeDuration]);

  // Auto-generate se arriva dalla homepage "Coba Gratis" (lancia auto-chain/login, script per anonimo).
  useEffect(() => {
    if (!currentProject) return;
    if (currentProject.id !== projectId) return;
    if (autoGeneratedRef.current === projectId) return;
    if (window.sessionStorage.getItem("auto_generate") !== projectId) return;
    // Attendi topic idratato (da initial_topic / project.topic).
    if (!topic.trim()) return;
    if (!projectLoadedRef.current) return;
    // Per login attendi anche il profilo (default genre/platform/durata dalla persona).
    if (user && !profile) return;
    autoGeneratedRef.current = projectId;
    window.sessionStorage.removeItem("auto_generate");
    void handleAutoRun();
  }, [currentProject, projectId, topic, user, profile, handleAutoRun]);

useEffect(()=> {
  if (isAnon) return;
  if (runningStep === "script") {
    setScriptKeepExpanded(true);
    return;
  }
  if (frontier === "script"&&scriptHas&&scriptKeepExpanded) {
    const t = setTimeout(()=> setScriptKeepExpanded(false),1600);
    return ()=> clearTimeout(t);
  }
  }, [isAnon, runningStep, frontier, scriptHas, scriptKeepExpanded]);

useEffect(()=> {
  if (!isAnon) return;
  if (!scriptHas) return;
  if (anonGateShownRef.current) return;
  anonGateShownRef.current = true;
  setAuthGateOpen(true);
  }, [isAnon, scriptHas]);

  const handleRegenScript = useCallback(async () => {
    if (isRunning) return;
    recordBehavior("regen_script", projectId);
    await generateStep("script", projectId);
  }, [isRunning, projectId, generateStep]);

  const handleContinueAudio = useCallback(async () => {
    if (isRunning) return;
    // Login wall anonim: bukan login → tampilkan gate, jangan generate audio dulu.
    if (!user) {
      setAuthGateOpen(true);
      return;
    }
    setAuthGateOpen(false);
    recordBehavior("lanjut_script_langsung", projectId, {
      provider: audioProvider,
      speed: audioSpeed,
      emotion: audioEmotion,
      platform: activePlatform,
      duration: activeDuration,
    });
    await generateStep("audio", projectId, { provider: audioProvider, speed: audioSpeed, emotion: audioProvider === "cartesia" ? audioEmotion : undefined });
  }, [isRunning, user, projectId, generateStep, audioProvider, audioSpeed, audioEmotion, activePlatform, activeDuration]);

  const handleRegenAudio = useCallback(async () => {
    if (isRunning) return;
    recordBehavior("regen_audio", projectId, { provider: audioProvider, speed: audioSpeed, emotion: audioEmotion });
    // Preferenza behavior: provider usato per la rigenerazione (per auto-chain future).
    recordPreference("provider", audioProvider);
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
          {user && profile?.gaya && profile?.cerita && (
              <span>Gaya: {gayaLabel(profile.niche, profile.gaya)} | Cara: {ceritaLabel(profile.niche, profile.gaya, profile.cerita)}</span>
          )}
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
                ref={topicRef}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={placeholder}
                rows={4}
                className="w-full resize-none rounded-xl border bg-card px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />

              {trendsLoading ? (
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Mencari topik yang lagi naik...
                  </p>
                </div>
              ) : trends.length > 0 ? (
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {trends[0]?.source === "ai_fallback" ? "Topik yang lagi naik:" : trends[0]?.source === "youtube_us" ? "Akan trending (early signal):" : "Lagi banyak dicari hari ini:"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {trends.map((t, i) => (
                      <button key={i} onClick={() => setTopic(t.keyword)} className="rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-primary hover:bg-accent">{t.keyword}</button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {trends[0]?.source === "ai_fallback" ? "Saran topik dari AI (sumber video belum tersedia sekarang)." : "Berdasarkan video yang sedang populer di Indonesia. Klik untuk langsung isi topik."}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Ketik topik atau pilih dari saran di atas
                </p>
              )}

              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Platform</p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(PLATFORM_LABEL) as Platform[]).map((pl) => (
                      <button key={pl} onClick={() => { pickOverridePlatform(pl); recordBehavior("ganti_platform", projectId, { platform: pl }); recordPreference("platform", pl as string); }} className={`rounded-full border px-3 py-1.5 text-sm ${activePlatform === pl ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{PLATFORM_LABEL[pl]}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Durasi</p>
                  <div className="flex flex-wrap gap-2">
                    {[15, 30, 60, 90, 180].map((d) => (
                      <button key={d} onClick={() => { pickOverrideDuration(d); recordBehavior("ganti_durasi", projectId, { duration: d }); recordPreference("duration", d); }} className={`rounded-full border px-3 py-1.5 text-sm ${activeDuration === d ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{d === 180 ? "3 menit" : `${d} detik`}</button>
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
            {progress.currentStep === "video" && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress.progress}%` }} />
              </div>
            )}
          </div>
        )}

        {progress.error && !isRunning && (
          <div className="mt-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{progress.error}</p>
          </div>
        )}

        {limitModal && !isRunning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-primary/25 bg-card p-6 shadow-xl">
              <p className="text-base font-semibold">Batas project ber-isi tercapai</p>
              <p className="mt-2 text-sm text-muted-foreground">Hapus project terlama:<br />{limitModal.title}</p>
              {oldestError && (
                <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {oldestError}
                </p>
              )}
              <div className="mt-4 flex flex-col gap-2">
                <Button onClick={handleDeleteOldest} disabled={deletingOldest} className="gap-2">
                  {deletingOldest ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Menghapus...
                    </>
                  ) : (
                    "Hapus Project Terlama"
                  )}
                </Button>
                <Button variant="outline" onClick={() => setLimitModal(null)} disabled={deletingOldest}>Batal</Button>
              </div>
            </div>
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
              showPercent={false}
              thinkSteps={progress.thinkSteps}
              thinkActiveIndex={progress.thinkActiveIndex}
            />
          </div>

          <div ref={audioRef}>
            {/* Login wall anonim: muncul di atas AudioCard saat klik "Lanjut ke Audio" */}
            <div
              className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity duration-300 ${
                authGateOpen
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
              aria-hidden={!authGateOpen}
            >
              <div className="w-full max-w-md animate-in fade-in-0 zoom-in-95 duration-300 rounded-2xl border border-primary/25 bg-card p-6 shadow-xl">
                <div className="w-full flex flex-col gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground sm:text-base">
                      Script kamu sudah siap!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Daftar gratis untuk lanjut ke audio dan video.
                    </p>
                  </div>
                  <div className="flex w-full flex-col items-stretch gap-2">
                    <Button asChild className="w-full sm:w-auto">
                      <Link href="/daftar">Daftar Gratis</Link>
                    </Button>
                    <Link
                      href="/masuk"
                      className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Sudah punya akun? Masuk
                    </Link>
                    <p className="text-xs text-muted-foreground/70">
                      Gratis tanpa kartu kredit • Scriptmu tersimpan otomatis
                    </p>
                    <Button variant="outline" onClick={()=>setAuthGateOpen(false)} className="w-full">Lihat hasil script</Button>
                  </div>
                </div>
              </div>
            </div>
            <AudioCard
              mode={audioMode}
              audio={projectAudio}
              onContinueVideo={handleContinueVideo}
              onRegenAudio={handleRegenAudio}
              disabled={isRunning}
              running={progress.isRunning && progress.currentStep === "audio"}
              progress={progress.progress}
              statusMessage={progress.statusMessage}
              showPercent={false}
              thinkSteps={progress.thinkSteps}
              thinkActiveIndex={progress.thinkActiveIndex}
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
              showPercent
              thinkSteps={progress.thinkSteps}
              thinkActiveIndex={progress.thinkActiveIndex}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
