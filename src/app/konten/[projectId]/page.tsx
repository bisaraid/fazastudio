"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useProjectStore } from "@/lib/store/projectStore";
import { usePipeline } from "@/hooks/usePipeline";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { recordBehavior } from "@/lib/behavior";
import { Genre, Platform } from "@/lib/types";
import { providerLabel, VOICE_EMOTIONS } from "@/lib/constants";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  RefreshCw,
  ArrowDown,
  Download,
  Pencil,
  ChevronDown,
  Play,
  Pause,
  Headphones,
  Volume2,
  VolumeX,
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
  const { progress, generateStep, previewAudio } = usePipeline();

  // ===== Pilihan audio (provider/kecepatan/emosi) + preview =====
  const [audioProvider, setAudioProvider] = useState<"google" | "cartesia" | "elevenlabs">("cartesia");
  const [audioSpeed, setAudioSpeed] = useState(1.0);
  const [audioEmotion, setAudioEmotion] = useState<string>("netral");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreviewAudio = useCallback(async () => {
    const hasScript = !!useProjectStore.getState().currentProject?.script;
    if (previewLoading || !hasScript) return;

    // Jika preview sudah ada di cache (blob in-memory) → replay langsung,
    // TIDAK fetch/generate ulang (hemat kuota).
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
      const url = await previewAudio(projectId, {
        provider: audioProvider,
        speed: audioSpeed,
        emotion: audioProvider === "cartesia" ? audioEmotion : undefined,
      });
      if (url) setPreviewUrl(url);
      else setPreviewError("Preview tidak tersedia. Coba pilih kualitas Standar, atau daftar untuk jatah premium.");
    } catch (e: any) {
      setPreviewError(e?.message || "Preview gagal.");
    } finally {
      setPreviewLoading(false);
    }
  }, [previewLoading, previewAudio, projectId, audioProvider, audioSpeed, audioEmotion, previewUrl]);

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
    await generateStep("audio", projectId, {
      provider: audioProvider,
      speed: audioSpeed,
      emotion: audioProvider === "cartesia" ? audioEmotion : undefined,
    });
  }, [isRunning, projectId, generateStep, audioProvider, audioSpeed, audioEmotion]);

  const handleRegenAudio = useCallback(async () => {
    if (isRunning) return;
    recordBehavior("regen_audio", projectId);
    await generateStep("audio", projectId, {
      provider: audioProvider,
      speed: audioSpeed,
      emotion: audioProvider === "cartesia" ? audioEmotion : undefined,
    });
  }, [isRunning, projectId, generateStep, audioProvider, audioSpeed, audioEmotion]);

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

        {/* ERROR (setelah request selesai tanpa hasil) — jangan biarkan diam tanpa jejak */}
        {progress.error && !isRunning && (
          <div className="mt-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{progress.error}</p>
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

                {/* Pilihan suara + preview */}
                <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs font-medium text-muted-foreground">Suara</label>
                    <div className="flex flex-wrap gap-2">
                      {(["cartesia", "elevenlabs", "google"] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setAudioProvider(p)}
                          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            audioProvider === p
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-card text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {audioProvider === p && <Play className="h-3 w-3" />}
                          {providerLabel(p)}
                        </button>
                      ))}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">Kecepatan</label>
                      <select
                        value={audioSpeed}
                        onChange={(e) => setAudioSpeed(Number(e.target.value))}
                        className="rounded-lg border bg-card px-2 py-1.5 text-xs outline-none focus:border-primary"
                      >
                        <option value={0.8}>0.8×</option>
                        <option value={1.0}>1.0×</option>
                        <option value={1.2}>1.2×</option>
                        <option value={1.5}>1.5×</option>
                      </select>
                    </div>
                  </div>

                  {audioProvider === "cartesia" && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">Emosi</label>
                      <select
                        value={audioEmotion}
                        onChange={(e) => setAudioEmotion(e.target.value)}
                        className="w-full rounded-lg border bg-card px-2 py-1.5 text-xs outline-none focus:border-primary"
                      >
                        {VOICE_EMOTIONS.map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Preview */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handlePreviewAudio}
                      disabled={previewLoading || isRunning}
                      className="gap-1.5"
                    >
                      <Headphones className="h-4 w-4" />
                      {previewLoading ? "Membuat preview..." : "Dengar Preview"}
                    </Button>
                    {previewPlaying && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memutar preview…
                      </span>
                    )}
                    {previewError && <span className="text-xs text-destructive">{previewError}</span>}
                  </div>
                  {previewUrl && (
                    <audio
                      ref={previewAudioRef}
                      src={previewUrl}
                      autoPlay
                      onPlay={() => setPreviewPlaying(true)}
                      onPause={() => setPreviewPlaying(false)}
                      onEnded={() => setPreviewPlaying(false)}
                      className="hidden"
                    />
                  )}
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
                <AudioPlayer src={projectAudio.url} />
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
                <VideoPlayer src={projectVideo.url} />
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
/** Bangun URL proxy (audio/video) untuk pemutaran di browser. */
function proxyUrl(route: string, target: string): string {
  return `/${route}?url=${encodeURIComponent(target)}`;
}

/** Format detik → m:ss */
function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

/** Progress bar dengan thumb — reusable untuk audio & video. */
function ProgressBar({
  value,
  duration,
  onSeek,
}: {
  value: number;
  duration: number;
  onSeek: (t: number) => void;
}) {
  const pct = duration > 0 ? Math.min(100, (value / duration) * 100) : 0;
  return (
    <div
      className="group/progress relative h-1.5 w-full cursor-pointer rounded-full bg-muted-foreground/20"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        onSeek(ratio * duration);
      }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-fuchsia-500"
        style={{ width: `${pct}%` }}
      />
      <div
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow ring-1 ring-black/10 transition-opacity group-hover/progress:opacity-100"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
/** Custom elegant audio player (via proxy untuk bypas CORS). */
function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  return (
    <div className="space-y-2">
      <audio
        ref={ref}
        src={proxyUrl("api/audio-proxy", src)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-fuchsia-600 text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-105 active:scale-95"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
        </button>
        <div className="flex-1">
          <ProgressBar
            value={current}
            duration={duration}
            onSeek={(t) => {
              const el = ref.current;
              if (el) el.currentTime = t;
            }}
          />
          <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>{fmtTime(current)}</span>
            <span>{duration > 0 ? fmtTime(duration) : "--:--"}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const el = ref.current;
            if (el) {
              el.muted = !el.muted;
              setMuted(el.muted);
            }
          }}
          aria-label={muted ? "Unmute" : "Mute"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
/** Custom elegant video player (via proxy). */
function VideoPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border bg-black">
      <video
        ref={ref}
        src={proxyUrl("api/video-proxy", src)}
        preload="metadata"
        className="w-full aspect-video"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(duration);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition-transform hover:scale-110">
            <Play className="ml-1 h-8 w-8" />
          </span>
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
        <ProgressBar
          value={current}
          duration={duration}
          onSeek={(t) => {
            const el = ref.current;
            if (el) el.currentTime = t;
          }}
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-transform hover:scale-105"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <span className="text-xs tabular-nums text-white/90">
            {fmtTime(current)} / {duration > 0 ? fmtTime(duration) : "--:--"}
          </span>
        </div>
      </div>
    </div>
  );
}