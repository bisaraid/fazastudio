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
import { Genre, PipelineStep, Platform, StepStatus } from "@/lib/types";
import {
  Sparkles,
  Loader2,
  Pencil,
  ChevronDown,
  ChevronUp,
  Download,
  Headphones,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Lock,
} from "lucide-react";
import { ScriptCard } from "@/components/pipeline/ScriptCard";
import { AudioCard } from "@/components/pipeline/AudioCard";
import { VideoCard } from "@/components/pipeline/VideoCard";
import {
  getStepViewState,
  normalizeStep,
  STEP_ORDER,
  type StepKey,
  type StepViewState,
  type StepViewStatus,
} from "@/lib/pipeline/step-view-state";
import { pickResumeAction, UPGRADE_HREF } from "@/lib/pipeline/resume-action";
import { providerLabel } from "@/lib/constants";
import { PostingCard } from "./PostingCard";
import { track } from "@/lib/posthog";

// ==== Mapping niche → genre + platform + durasi default ====
// Simple focus trap for modals: Escape sluit, Tab vancirkelt tussen eerste/laatste.
function trapModalFocus(e: { key: string; shiftKey: boolean; preventDefault: () => void; currentTarget: HTMLElement }, onClose: () => void) {
  if (e.key === "Escape") {
    e.preventDefault();
    onClose();
    return;
  }
  if (e.key !== "Tab") return;
  const root = e.currentTarget;
  const focusable = Array.from(
    root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
  if (!focusable.length) return;
  const first = focusable[0] as HTMLElement;
  const last = focusable[focusable.length - 1] as HTMLElement;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

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

/** Fallback bila project belum ter-hidrasi (dipakai sebelum currentProject ada). */
const EMPTY_STEPS: Record<PipelineStep, StepStatus> = {
  script: "pending",
  audio: "pending",
  subtitle: "pending",
  video: "pending",
  export: "pending",
};

const STEP_LABEL: Record<StepKey, string> = { script: "Script", audio: "Audio", video: "Video" };

const STEP_STATUS_TEXT: Record<StepViewStatus, string> = {
  locked: "belum bisa dikerjakan",
  ready: "siap dikerjakan",
  running: "sedang diproses",
  done: "selesai",
  error: "gagal",
};

/**
 * D4: stepper ringkas satu baris ("1 Script · 2 Audio · 3 Video").
 * Sumbernya sama dengan kartu (getStepViewState) — subtitle tetap bagian Audio.
 */
function PipelineStepper({ state }: { state: StepViewState }) {
  return (
    <ol
      aria-label="Tahapan konten"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
    >
      {STEP_ORDER.map((key, i) => {
        const view = state.steps[key];
        const tone =
          view.status === "error"
            ? "font-medium text-destructive"
            : view.current || view.status === "running"
              ? "font-medium text-primary"
              : view.status === "done"
                ? "text-foreground"
                : "text-muted-foreground";
        return (
          <li key={key} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 ${tone}`}
              aria-current={view.current ? "step" : undefined}
            >
              {view.status === "done" ? (
                <CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-emerald-500" />
              ) : view.status === "running" ? (
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              ) : view.status === "error" ? (
                <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
              ) : view.status === "locked" ? (
                <Lock aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Circle aria-hidden className="h-3.5 w-3.5 text-muted-foreground/60" />
              )}
              {`${i + 1} ${STEP_LABEL[key]}`}
              <span className="sr-only">: {STEP_STATUS_TEXT[view.status]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function ProjectEditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { currentProject, loadProjects, setCurrentProject, updateProjectSetup, updateProjectMetadata, deleteProject } =
    useProjectStore();
  const { progress, generateStep, runAutoChain, previewAudio, resetAuthSignal } = usePipeline();
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
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
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
  const overrideFromStorageRef = useRef<string | null>(null);
  const [trends, setTrends] = useState<{ keyword: string; source: string }[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [deletingOldest, setDeletingOldest] = useState(false);
  const [oldestError, setOldestError] = useState<string | null>(null);
  const authGateRef = useRef<HTMLDivElement | null>(null);
  const limitModalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (authGateOpen) {
      (authGateRef.current?.querySelector("button:not([disabled]), a[href]") as HTMLElement | null)?.focus();
    }
  }, [authGateOpen]);

  useEffect(() => {
    if (limitModal) {
      (limitModalRef.current?.querySelector("button:not([disabled]), a[href]") as HTMLElement | null)?.focus();
    }
  }, [limitModal]);

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
      setIsProjectLoading(true);
      projectLoadedRef.current = false;
      try {
        // Redirect-immediate: project al optimistisch in de store (createProject)
        // → skip de fresh fetch, anders zouden we het project kwijtraken.
        if (useProjectStore.getState().currentProject?.id === projectId) {
          if (cancelled) return;
          projectLoadedRef.current = true;
          setIsProjectLoading(false);
          return;
        }
        await loadProjects();
        if (cancelled) return;
        setCurrentProject(projectId);
      } finally {
        if (!cancelled) {
          projectLoadedRef.current = true;
          setIsProjectLoading(false);
        }
      }
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

  // Override platform/durasi uit de beranda-modal (sessionStorage) — respecteer de
  // keuze van de user bij generate. Pas toe bij mount en wis de keys daarna.
  useEffect(() => {
    if (!currentProject || currentProject.id !== projectId) return;
    if (overrideFromStorageRef.current === projectId) return;
    overrideFromStorageRef.current = projectId;
    const plat = window.sessionStorage.getItem("override_platform");
    const dur = window.sessionStorage.getItem("override_duration");
    if (plat) {
      const p = plat as Platform;
      setOverridePlatform(p);
      overridePlatformRef.current = p;
      updateProjectMetadata({ overridePlatform: p });
    }
    if (dur && Number.isFinite(Number(dur))) {
      const d = Number(dur);
      setOverrideDuration(d);
      overrideDurationRef.current = d;
      updateProjectMetadata({ overrideDuration: d });
    }
    if (plat) window.sessionStorage.removeItem("override_platform");
    if (dur) window.sessionStorage.removeItem("override_duration");
  }, [projectId, currentProject?.id]);

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
  const isAnon = !user;

  // D1: satu sumber state untuk seluruh UI pipeline (script → audio → video).
  const stepState = getStepViewState({
    steps: currentProject?.steps ?? EMPTY_STEPS,
    isRunning,
    currentStep: progress.currentStep,
    hasScript: scriptHas,
    hasAudio: audioHas,
    hasVideo: videoHas,
  });
  const stepOf = (key: StepKey) => stepState.steps[key];
  // Anonim: script yang sudah jadi tetap terbuka selama user belum
  // "melanjutkan" (ia berhenti di gerbang daftar) supaya hasil gratis tidak
  // terlipat di balik accordion.
  const scriptCardOpen = stepOf("script").current || (isAnon && scriptHas);

  // D10: auto-scroll hanya saat step berpindah (bukan tiap perubahan state).
  const scriptRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLDivElement | null>(null);
  const runningKey = isRunning ? normalizeStep(progress.currentStep) : null;
  const focusStep: StepKey | null = runningKey ?? stepState.current;
  useEffect(() => {
    const ref =
      focusStep === "script" ? scriptRef : focusStep === "audio" ? audioRef : focusStep === "video" ? videoRef : null;
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusStep]);

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
      track("project_deleted", { projectId: id });
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
  if (!isAnon) return;
  if (!scriptHas) return;
  if (anonGateShownRef.current) return;
  anonGateShownRef.current = true;
  setAuthGateOpen(true);
  }, [isAnon, scriptHas]);

// 5D: endpoint mahal (TTS/subtitle/video) menolak anon dengan 401 → bukan error
// merah, cukup buka gate daftar lalu bersihkan sinyalnya.
useEffect(() => {
  if (!progress.requiresAuth) return;
  setAuthGateOpen(true);
  resetAuthSignal();
}, [progress.requiresAuth, resetAuthSignal]);

  const handleRegenScript = useCallback(async () => {
    if (isRunning) return;
    recordBehavior("regen_script", projectId);
    await generateStep("script", projectId);
  }, [isRunning, projectId, generateStep]);

  // Fase 4B (D11): SATU jalur untuk audio → subtitle → video.
  // `runAutoChain` kini resume-aware (step yang sudah selesai di-skip), jadi
  // fungsi ini melayani tiga aksi tanpa percabangan lama:
  //   - "Buat Audio & Video" (script sudah selesai)
  //   - "Coba Lagi" setelah gagal di audio/subtitle/video (lanjut dari errorStep)
  //   - "Sambungkan ke Render" saat job render lama masih hidup di server
  const handleRunChain = useCallback(async () => {
    if (isRunning) return;
    // Login wall anonim: bukan login → tampilkan gate, jangan generate apa pun.
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
    recordPreference("provider", audioProvider);
    await runAutoChain(projectId, {
      audioOptions: {
        provider: audioProvider,
        speed: audioSpeed,
        emotion: audioProvider === "cartesia" ? audioEmotion : undefined,
      },
    });
  }, [isRunning, user, projectId, runAutoChain, audioProvider, audioSpeed, audioEmotion, activePlatform, activeDuration]);

  const handleRegenAudio = useCallback(async () => {
    if (isRunning) return;
    recordBehavior("regen_audio", projectId, { provider: audioProvider, speed: audioSpeed, emotion: audioEmotion });
    // Preferenza behavior: provider usato per la rigenerazione (per auto-chain future).
    recordPreference("provider", audioProvider);
    await generateStep("audio", projectId, { provider: audioProvider, speed: audioSpeed, emotion: audioProvider === "cartesia" ? audioEmotion : undefined });
  }, [isRunning, projectId, generateStep, audioProvider, audioSpeed, audioEmotion]);

  // Fase 4B (D11): pengaturan audio (accordion di kartu Script) dapat dibuka
  // dari hint "Suara: ..." di sticky bar → state dikendalikan halaman.
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const openAudioSettings = useCallback(() => {
    setAudioSettingsOpen(true);
    scriptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  // Hint 1 baris: pengaturan suara terlihat SEBELUM user menekan tombol utama.
  const audioHintLabel = `Suara: ${providerLabel(audioProvider)} · ${audioSpeed.toFixed(1)}×`;

  // D7: subtitle gagal → user punya aksi konkret (tanpa dead-end di step video).
  const handleRegenSubtitle = useCallback(async () => {
    if (isRunning) return;
    await generateStep("subtitle", projectId);
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
      // REL-05: PREVIEW_USED = jatah preview gratis habis → tawarkan daftar.
      if (e?.code === "PREVIEW_USED") setAuthGateOpen(true);
    } finally {
      setPreviewLoading(false);
    }
  }, [previewLoading, previewAudio, projectId, audioProvider, audioSpeed, audioEmotion, previewUrl]);

  // D3 + Fase 4B: satu tombol utama per saat, aksinya dipilih oleh fungsi murni
  // `pickResumeAction` (src/lib/pipeline/resume-action.ts). Dengan begitu
  // "Coba Lagi" selalu melanjutkan dari errorStep tanpa mengulang step yang
  // sudah selesai, dan 402 berubah menjadi tawaran upgrade.
  const resumeAction = pickResumeAction({
    isRunning,
    hasScript: scriptHas,
    hasAudio: audioHas,
    hasSubtitle: !!projectSubtitle,
    hasVideo: videoHas,
    errorStep: progress.errorStep ?? null,
    errorCode: progress.errorCode ?? null,
    videoJobActive: progress.videoJobActive === true,
  });

  // Hint audio hanya relevan saat aksi berikutnya melibatkan pembuatan audio.
  const showAudioHint = !isRunning && resumeAction.kind === "chain";

  const primaryAction: {
    label: string;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    hint?: string;
  } | null = (() => {
    if (isRunning) {
      return { label: progress.statusMessage || "Mengerjakan...", disabled: true };
    }
    switch (resumeAction.kind) {
      case "none":
        return null;
      case "download":
        return projectVideo?.url
          ? { label: resumeAction.label, href: projectVideo.url }
          : null;
      case "upgrade":
        return { label: resumeAction.label, href: UPGRADE_HREF, hint: resumeAction.hint };
      case "limited":
        // 5B: batas harian/rate-limit → tombol utama DISABLED (bukan "Coba Lagi")
        // disertai waktu tunggu dari Retry-After.
        return { label: resumeAction.label, disabled: true, hint: resumeAction.hint };
      case "auth":
        // 5D: anon ditolak endpoint mahal (401) → buka gate daftar.
        return { label: resumeAction.label, onClick: () => setAuthGateOpen(true) };
      case "script":
        return {
          label: resumeAction.label,
          onClick: handleGenerate,
          disabled: !topic.trim(),
          // 5A: regenerate script pada project yang sama mendebet 1 kredit lagi.
          hint: "Memakai 1 kredit.",
        };
      default:
        // "chain" | "subtitle" | "video" → satu jalur rantai yang resume-aware.
        return { label: resumeAction.label, onClick: handleRunChain, hint: resumeAction.hint };
    }
  })();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-3xl px-4 pt-8 pb-28 lg:px-8">
          {isProjectLoading ? (
            <div className="space-y-4" aria-label="Memuat project">
              <div className="space-y-1.5">
                <div className="h-6 w-1/2 animate-pulse rounded bg-muted-foreground/20" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted-foreground/15" />
              </div>
              {/* Placeholder: panel edit topik */}
              <div className="rounded-xl border bg-card p-4">
                <div className="h-24 w-full animate-pulse rounded-lg bg-muted-foreground/15" />
                <div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-muted-foreground/20" />
                <div className="mt-3 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-muted-foreground/10" />
                  ))}
                </div>
              </div>
              {/* Placeholder: pipeline cards */}
              <div className="space-y-2">
                <div className="h-16 w-full animate-pulse rounded-xl bg-muted-foreground/10" />
                <div className="h-16 w-full animate-pulse rounded-xl bg-muted-foreground/10" />
              </div>
            </div>
          ) : !currentProject || currentProject.id !== projectId ? (
            <div className="flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-16 text-center">
              <h2 className="text-lg font-semibold">Project tidak ditemukan</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Project ini sudah dihapus atau tidak lagi bisa diakses.
              </p>
              <Link
                href="/beranda"
                className="mt-6 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Kembali ke Beranda
              </Link>
            </div>
          ) : (
            <>
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{greet}</h1>
          <p className="text-sm text-muted-foreground">Tulis satu hal, sisanya kami yang kerjakan.</p>
          {user && profile?.gaya && profile?.cerita && (
              <span>Gaya: {gayaLabel(profile.niche, profile.gaya)} | Cara: {ceritaLabel(profile.niche, profile.gaya, profile.cerita)}</span>
          )}
        </div>

        {/* C (D4): stepper ringkas — user tahu posisinya tanpa scroll */}
        <div className="mb-4">
          <PipelineStepper state={stepState} />
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
                onKeyDown={(e) => {
                  // K2: Enter = aksi yang sama dengan tombol utama di sticky bar.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleGenerate();
                  }
                }}
                placeholder={placeholder}
                rows={4}
                className="w-full resize-none rounded-xl border bg-card px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground">
                Tekan Enter untuk mulai · Shift+Enter untuk baris baru.
              </p>

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

              {/* K2: aksi utama hanya di sticky bar (Enter di topik juga jalan).
                  Di panel hanya tombol sekunder "Ulangi Script" bila script ada. */}
              {scriptHas && (
                <Button
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={!topic.trim() || isRunning}
                  className="h-11 w-full gap-2 sm:w-auto"
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isRunning ? "Mengerjakan..." : "Ulangi Script"}
                </Button>
              )}
            </div>
          )}
        </div>

        {limitModal && !isRunning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              ref={limitModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="limit-modal-title"
              onKeyDown={(e) => trapModalFocus(e, () => setLimitModal(null))}
              className="w-full max-w-md rounded-xl border border-primary/25 bg-card p-6 shadow-xl"
            >
              <p id="limit-modal-title" className="text-base font-semibold">Batas project ber-isi tercapai</p>
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
          <div ref={scriptRef} className="scroll-mt-20">
            <ScriptCard
              mode={stepOf("script").status}
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
              onRegenScript={handleRegenScript}
              disabled={isRunning}
              isCurrent={scriptCardOpen || audioSettingsOpen}
              audioSettingsOpen={audioSettingsOpen}
              onAudioSettingsToggle={setAudioSettingsOpen}
              errorMessage={progress.errorStep === "script" ? progress.error : null}
              lockedHint="Selesaikan script dulu."
              progress={progress.progress}
              statusMessage={progress.statusMessage}
              showPercent={false}
              slow={progress.slow}
            />
          </div>

          <div ref={audioRef} className="scroll-mt-20">
            {/* Login wall anonim: muncul di atas AudioCard saat klik "Lanjut ke Audio" */}
            <div
              className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity duration-300 ${
                authGateOpen
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
              aria-hidden={!authGateOpen}
            >
              <div
                ref={authGateRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="auth-gate-title"
                onKeyDown={(e) => trapModalFocus(e, () => setAuthGateOpen(false))}
                className="w-full max-w-md animate-in fade-in-0 zoom-in-95 duration-300 rounded-2xl border border-primary/25 bg-card p-6 shadow-xl"
              >
                <div className="w-full flex flex-col gap-4">
                  <div className="space-y-1">
                    <p id="auth-gate-title" className="text-sm font-semibold text-foreground sm:text-base">
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
              mode={stepOf("audio").status}
              audio={projectAudio}
              onRegenAudio={handleRegenAudio}
              onRetrySubtitle={handleRegenSubtitle}
              subtitleFailed={stepState.subtitleFailed}
              subtitleErrorMessage={progress.subtitleError}
              disabled={isRunning}
              isCurrent={stepOf("audio").current}
              errorMessage={progress.errorStep === "audio" ? progress.error : null}
              lockedHint="Selesaikan script dulu."
              progress={progress.progress}
              statusMessage={progress.statusMessage}
              showPercent={false}
              slow={progress.slow}
            />
          </div>

          <div ref={videoRef} className="scroll-mt-20">
            <VideoCard
              mode={stepOf("video").status}
              video={projectVideo}
              audioUrl={projectAudio?.url}
              srtContent={projectSubtitle?.srtContent}
              vttContent={projectSubtitle?.vttContent || projectSubtitle?.srtContent}
              onStartVideo={handleRunChain}
              isCurrent={stepOf("video").current}
              errorMessage={progress.errorStep === "video" ? progress.error : null}
              lockedHint={
                stepState.subtitleFailed
                  ? "Menunggu subtitle selesai dibuat."
                  : "Selesaikan audio dulu."
              }
              progress={progress.progress}
              statusMessage={progress.statusMessage}
              showPercent
              slow={progress.slow}
            />
          </div>

          {/* D9: caption/hashtag SETELAH kartu Video supaya urutan langkah jelas */}
          {projectAudio && <PostingCard script={currentProject?.script} />}
        </div>

        {/* D3: satu tombol utama per saat — selalu terjangkau tanpa scroll */}
        {primaryAction && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
            <div className="mx-auto w-full max-w-3xl px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] lg:px-8">
              {/* Fase 4B (D11): hint 1 baris — pengaturan suara terlihat sebelum
                  klik; tap membuka accordion "Pengaturan Audio" di kartu script. */}
              {showAudioHint && (
                <button
                  type="button"
                  onClick={openAudioSettings}
                  className="mb-2 flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Headphones className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{audioHintLabel}</span>
                  <span className="shrink-0 underline">ubah</span>
                </button>
              )}
              {primaryAction.hint && !showAudioHint && (
                <p className="mb-2 text-center text-xs text-muted-foreground">
                  {primaryAction.hint}
                </p>
              )}
              {primaryAction.href ? (
                primaryAction.href === UPGRADE_HREF ? (
                  <Button asChild className="h-12 w-full gap-2 text-base">
                    <Link href={UPGRADE_HREF}>
                      <Sparkles className="h-5 w-5" /> {primaryAction.label}
                    </Link>
                  </Button>
                ) : (
                  <Button asChild className="h-12 w-full gap-2 text-base">
                    <a href={primaryAction.href} download>
                      <Download className="h-5 w-5" /> {primaryAction.label}
                    </a>
                  </Button>
                )
              ) : (
                <Button
                  onClick={primaryAction.onClick}
                  disabled={primaryAction.disabled}
                  className="h-12 w-full gap-2 text-base"
                >
                  {isRunning ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : stepState.errorStep ? (
                    <RefreshCw className="h-5 w-5" />
                  ) : (
                    <Sparkles className="h-5 w-5" />
                  )}
                  <span
                    className="truncate"
                    role={isRunning ? "status" : undefined}
                    aria-live={isRunning ? "polite" : undefined}
                  >
                    {primaryAction.label}
                  </span>
                </Button>
              )}
            </div>
          </div>
        )}
            </>
          )}
      </main>
    </div>
  );
}
