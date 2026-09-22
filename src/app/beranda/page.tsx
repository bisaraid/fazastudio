"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/store/projectStore";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  FileText,
  Music,
  Subtitles,
  Video,
  Clock,
  TrendingUp,
  BarChart3,
  ArrowRight,
  Trash2,
  Play,
  Sparkles,
  Loader2,
  Ghost,
  Heart,
  GraduationCap,
  Wallet,
  Landmark,
  ShoppingBag,
  Flame,
  Brain,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { formatDuration, generateId } from "@/lib/utils";
import { Genre, Platform, Project } from "@/lib/types";
import { PLATFORMS, DURATION_OPTIONS } from "@/lib/constants";
import { readPreferences } from "@/lib/preferences";
import { ProjectRow } from "@/components/project-row";
import { NICHES, GAYA_BY_NICHE } from "@/lib/persona-data";
import { track } from "@/lib/posthog";

// Focus trap sederhana untuk modal (Escape sluit, Tab vancirkelt binnen modal).
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

/** Bersihkan judul trending: buang karakter khusus di awal (emoji, [ID], simbol, spasi). */
function cleanTrendingKey(raw: string): string {
  let i = 0;
  while (i < raw.length) {
    const code = raw.codePointAt(i)!;
    let special: boolean;
    if (code <= 0x7f) {
      // ASCII: apa pun selain huruf/angka (spasi, tanda baca, simbol) = karakter khusus.
      const ch = String.fromCharCode(code);
      special = !/[A-Za-z0-9]/.test(ch);
    } else {
      // Non-ASCII: rentang simbol/emoji/tanda baca — anggap karakter khusus.
      special =
        (code >= 0x2000 && code <= 0x2bff) ||
        (code >= 0x2e00 && code <= 0x2e7f) ||
        (code >= 0x3000 && code <= 0x303f) ||
        (code >= 0xfe00 && code <= 0xfeff) ||
        (code >= 0x1f000 && code <= 0x1faff);
    }
    if (!special) break;
    i += code > 0xffff ? 2 : 1;
  }
  return raw.slice(i).trim();
}

// Genre ACS default per niche (untuk createProject — bukan kosong).
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

function nicheLabel(niche: string): string {
  const all = [...NICHES.jualan, ...NICHES.konten];
  return all.find((n) => n.slug === niche)?.label ?? niche;
}

/** Label gaya ngomong yang readable (bukan slug) untuk badge konteks modal. */
function gayaLabelFor(niche: string, gaya: string): string {
  return (GAYA_BY_NICHE[niche] ?? []).find((g) => g.key === gaya)?.label ?? gaya;
}

const STATUS_MAP: Record<string, { label: string; variant: "secondary" | "success" | "warning" }> = {
  draft: { label: "Belum jadi", variant: "secondary" },
  processing: { label: "Sedang diproses", variant: "warning" },
  completed: { label: "Selesai", variant: "success" },
};

// Thumbnail in-progress: gradient + ikon per genre (pola visual ala Netflix).
const NICHE_VISUALS: Record<string, { gradient: string; icon: LucideIcon }> = {
  horor: { gradient: "from-zinc-900 via-purple-950 to-zinc-900", icon: Ghost },
  horror: { gradient: "from-zinc-900 via-purple-950 to-zinc-900", icon: Ghost },
  misteri: { gradient: "from-slate-900 via-indigo-950 to-slate-900", icon: Search },
  psikologi: { gradient: "from-sky-950 via-indigo-950 to-slate-900", icon: Brain },
  romance: { gradient: "from-rose-950 via-pink-900 to-rose-950", icon: Heart },
  motivasi: { gradient: "from-amber-950 via-orange-900 to-amber-950", icon: Flame },
  edukasi: { gradient: "from-emerald-950 via-teal-900 to-emerald-950", icon: GraduationCap },
  keuangan: { gradient: "from-emerald-950 via-green-900 to-emerald-950", icon: Wallet },
  affiliate: { gradient: "from-fuchsia-950 via-purple-900 to-fuchsia-950", icon: ShoppingBag },
  sejarah: { gradient: "from-stone-900 via-amber-950 to-stone-900", icon: Landmark },
};

function nicheVisual(genre?: string): { gradient: string; icon: LucideIcon } {
  return (
    (genre && NICHE_VISUALS[genre]) || {
      gradient: "from-slate-800 via-slate-900 to-slate-800",
      icon: Sparkles,
    }
  );
}

function projectTitle(p: Project): string {
  return p.title?.trim() || p.topic?.trim() || "Proyek tanpa judul";
}

const PAGE_SIZE = 20;

export default function DashboardPage() {
  const router = useRouter();
  const { projects, appendProjects, deleteProject, createProject } = useProjectStore();
  const [profile, setProfile] = useState<{ mode: string; niche: string; gaya?: string; cerita?: string } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    appendProjects(0, PAGE_SIZE)
      .then(function (n) {
        setHasMore(n >= PAGE_SIZE);
      })
      .finally(function () {
        setIsLoadingProjects(false);
      });
  }, [appendProjects]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success || !data?.data) return;
        setProfile({
          mode: data.data.layer1_mode as string,
          niche: data.data.niche_slug as string,
          gaya: data.data.gaya_key as string | undefined,
          cerita: data.data.cerita_key as string | undefined,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(function () {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (e.isIntersecting && hasMore && !loadingMore) {
          setLoadingMore(true);
          appendProjects(projects.length, PAGE_SIZE).then(function (n) {
            setHasMore(n >= PAGE_SIZE);
            setLoadingMore(false);
          });
        }
      });
    }, { rootMargin: "0px 0px 600px 0px" });
    obs.observe(el);
    return function () {
      obs.disconnect();
    };
  }, [hasMore, loadingMore, projects, appendProjects]);

  // ===== Modal "Buat Konten Baru" =====
  const [modalOpen, setModalOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [duration, setDuration] = useState(30);
  const [trending, setTrending] = useState<string[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const topicRef = useRef<HTMLTextAreaElement | null>(null);

  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!modalOpen) return;
    topicRef.current?.focus();
  }, [modalOpen]);

  // Buka modal (tanpa navigasi dulu) + prefill platform/durasi dari behavior +
  // fetch trending topics (personalisasi server pakai profile user).
  const handleCreateClick = async () => {
    setCreateError(null);
    setModalOpen(true);
    setTopic("");
    setPlatform("tiktok");
    setDuration(30);
    try {
      const prefs = await readPreferences();
      if (prefs.platform && PLATFORMS.some((p) => p.value === prefs.platform)) {
        setPlatform(prefs.platform as Platform);
      }
      if (typeof prefs.duration === "number" && DURATION_OPTIONS.some((d) => d.value === prefs.duration)) {
        setDuration(prefs.duration);
      }
    } catch {
      // tetap default
    }
    setTrendingLoading(true);
    fetch("/api/suggest?limit=6")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.ideas)) {
          const kw = data.ideas
            .map((i: { keyword?: unknown }) => String(i?.keyword ?? "").trim())
            .map(cleanTrendingKey)
            .filter(Boolean);
          setTrending(kw);
        }
      })
      .catch(() => setTrending([]))
      .finally(() => setTrendingLoading(false));
  };

  // "Mulai Generate" — buat project dengan data modal + redirect-immediate.
  const handleStartCreate = () => {
    const mode = profile?.mode ?? "";
    const niche = profile?.niche ?? "";
    const localId = generateId();
    void createProject(
      {
        genre: genreForNiche(mode, niche),
        customGenre: undefined,
        topic: topic.trim(),
        tone: "kasual",
        targetDuration: duration,
        platform,
        mode: "step-by-step",
        voiceName: "Sari",
        voiceLanguage: "id-ID",
        voiceSpeed: 1.0,
        voiceEmotion: "netral",
        visualStyle: "stock",
      },
      localId
    ).catch((err: unknown) => {
      console.warn("[beranda] createProject background errored:", err);
    });
    setModalOpen(false);
    // Draag pilihan modal + auto-generate over naar de editor (sessionStorage,
    // zelfde patroon als de landing page).
    window.sessionStorage.setItem("auto_generate", localId);
    window.sessionStorage.setItem("override_platform", platform);
    window.sessionStorage.setItem("override_duration", String(duration));
    router.push(`/konten/${localId}`);
  };

  // FIX 1 — hapus dengan konfirmasi + feedback error.
  const handleDeleteProject = async (projectId: string) => {
    const confirmed = confirm("Hapus project ini? Tindakan tidak bisa dibatalkan.");
    if (!confirmed) return;
    setDeletingId(projectId);
    try {
      await deleteProject(projectId);
      track("project_deleted", { projectId });
    } catch {
      alert("Gagal menghapus project. Coba lagi.");
    } finally {
      setDeletingId(null);
    }
  };

  const stats = {
    total: projects.length,
    completed: projects.filter((p) => p.status === "completed").length,
    processing: projects.filter((p) => p.status === "processing").length,
    drafts: projects.filter((p) => p.status === "draft").length,
  };

  // Pola "continue watching" ala Netflix — project terbaru yang belum selesai.
  const resumeProject =
    projects.find((p) => p.status !== "completed") ?? null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {/* Modal "Buat Konten Baru" */}
      {modalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-modal-title"
            onKeyDown={(e) => trapModalFocus(e, () => setModalOpen(false))}
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border bg-card shadow-xl"
          >
            {/* Header — pinned */}
            <div className="flex items-start justify-between gap-4 rounded-t-2xl border-b p-5">
              <div>
                <h2 id="create-modal-title" className="text-base font-semibold">Buat Konten Baru</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Isi topik, lalu pilih platform &amp; durasi.</p>
                {profile?.niche && profile?.gaya ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                    ✦ {nicheLabel(profile.niche)} · {gayaLabelFor(profile.niche, profile.gaya)}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Tutup"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — scroll di dalam kalau konten panjang */}
            <div className="flex-1 space-y-3 overflow-y-auto p-5 pt-3">
              {/* Topik */}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Topik</label>
                <textarea
                  ref={topicRef}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={2}
                  placeholder="Mau bikin konten tentang apa?"
                  className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                {/* Trending chips (skeleton saat fetch) */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {trendingLoading ? (
                    [0, 1, 2, 3].map((i) => (
                      <span key={i} className="inline-block h-6 w-20 animate-pulse rounded-full bg-muted-foreground/15" />
                    ))
                  ) : trending.length > 0 ? (
                    trending.slice(0, 4).map((t) => {
                      const display = t.length > 25 ? `${t.slice(0, 25)}...` : t;
                      return (
                        <button
                          key={t}
                          type="button"
                          title={t}
                          onClick={() => setTopic(t)}
                          className="whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors hover:border-primary hover:bg-accent"
                        >
                          {display}
                        </button>
                      );
                    })
                  ) : null}
                </div>
              </div>

              {/* Platform — satu baris, scroll horizontal */}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Platform</label>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPlatform(p.value)}
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        platform === p.value ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Durasi — satu baris, scroll horizontal */}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Durasi</label>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {DURATION_OPTIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDuration(d.value)}
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        duration === d.value ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer — pinned, tak ikut scroll */}
            <div className="shrink-0 border-t p-4">
              {createError && (
                <p className="mb-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                  {createError}
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <Button onClick={handleStartCreate} className="w-full gap-1.5">
                  Mulai Generate
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Batal</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <main className="container mx-auto px-4 py-8 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {profile?.niche
                ? `Hai, mau bikin konten ${nicheLabel(profile.niche).toLowerCase()} apa?`
                : "Mau bikin konten apa hari ini?"}
            </h1>
            <p className="text-muted-foreground mt-1">
              Tulis satu ide, Faza Studio yang kerjakan sisanya.
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2">
            {projects.length > 0 && (
              <>
                <Button size="lg" className="gap-2" onClick={handleCreateClick}>
                  <Plus className="h-5 w-5" /> Buat Konten Baru
                </Button>
                {createError && (
                  <p className="text-sm text-destructive text-right">{createError}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Lanjutkan — pola "continue watching": satu kartu, friction rendah */}
        {resumeProject && (
          <Card
            className="mb-8 cursor-pointer border-primary/40 bg-primary/5 transition-colors hover:border-primary/60"
            onClick={() => router.push(`/konten/${resumeProject.id}`)}
          >
            <CardContent className="flex items-center gap-4 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Play className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  Lanjutkan
                </p>
                <p className="truncate font-semibold">{projectTitle(resumeProject)}</p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Proyek</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoadingProjects ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted-foreground/20" /> : stats.total}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Selesai</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-500">
                {isLoadingProjects ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted-foreground/20" /> : stats.completed}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Sedang diproses</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">
                {isLoadingProjects ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted-foreground/20" /> : stats.processing}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Belum jadi</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoadingProjects ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted-foreground/20" /> : stats.drafts}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Project List */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Konten terbaru</h2>
          {isLoadingProjects ? (
            <div className="space-y-3" aria-label="Memuat project">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex w-full animate-pulse items-center gap-3 rounded-xl border bg-card p-3"
                >
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="h-3.5 w-1/3 rounded bg-muted-foreground/20" />
                    <div className="h-3 w-3/5 rounded bg-muted-foreground/15" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-4 w-14 rounded-full bg-muted-foreground/15" />
                    <span className="inline-block h-4 w-9 rounded bg-muted-foreground/15" />
                    <span className="inline-block h-4 w-8 rounded bg-muted-foreground/15" />
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Belum ada project</h3>
                <p className="text-muted-foreground text-sm max-w-md mb-6">
                  Mulai buat konten pertamamu — pilih topik, dan Faza Studio akan
                  mengubahnya menjadi script, suara, subtitle, dan video dalam satu alur.
                </p>
                <Button size="lg" onClick={handleCreateClick} className="gap-2">
                  <Plus className="h-4 w-4" /> Buat Project Pertama
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ul className="divide-y divide-border">
              {projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onOpen={() => router.push(`/konten/${project.id}`)}
                  onDelete={() => handleDeleteProject(project.id)}
                  deleting={deletingId === project.id}
                />
              ))}
            </ul>
          )}
          <div ref={sentinelRef} className="h-10" />
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const status = STATUS_MAP[project.status] || STATUS_MAP.draft;
  const completedSteps = (["script", "audio", "video"] as const)
    .filter((s) => project.steps[s] === "done").length;

  // Fallback judul agar kartu tidak kosong (mis. project baru tanpa topic).
  const cardTitle =
    project.title?.trim() ||
    project.topic?.trim() ||
    (project.genre ? `${project.genre} project` : "Proyek Baru");

  // FIX 3 — badge video free 24 jam / kedaluwarsa di kartu.
  // Hanya tampil bila project benar-benar punya video (bukan "Draft" kosong).
  const hasVideo = Boolean(project.video?.url);
  const [videoBroken, setVideoBroken] = useState(false);
  const isFreeVideoExpiring =
    hasVideo &&
    project.videoStoragePlan === "free" &&
    !!project.videoExpiresAt;
  const isVideoExpired =
    isFreeVideoExpiring &&
    new Date(project.videoExpiresAt as string).getTime() <= Date.now();

  return (
    <Card className={`group hover:shadow-md transition-shadow cursor-pointer overflow-hidden`} onClick={onOpen}>
      {/* Thumbnail: video utk project selesai, gradient+ikon per niche utk in-progress */}
      {isVideoExpired ? (
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
            <p>Video kedaluwarsa</p>
            <span className="text-primary text-sm underline-offset-2">Generate ulang</span>
          </div>
        </div>
      ) : project.video?.url ? (
        videoBroken ? (
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
              <p>Video tidak tersedia</p>
            </div>
          </div>
        ) : (
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <video
            src={project.video.url}
            className="h-full w-full object-cover"
            muted
            preload="metadata"
            onError={()=> setVideoBroken(true)}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="h-8 w-8 text-white" />
          </div>
        </div>
        )
      ) : (
        (() => {
          const vis = nicheVisual(project.genre);
          const Icon = vis.icon;
          return (
            <div
              className={`relative flex aspect-video w-full items-center justify-center overflow-hidden bg-gradient-to-br ${vis.gradient}`}
            >
              <Icon className="h-10 w-10 text-white/40" />
            </div>
          );
        })()
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base line-clamp-1">{cardTitle}</CardTitle>
            {/* Metadata → badge kecil, bukan baris teks */}
            <div className="flex flex-wrap items-center gap-1.5">
              {project.genre && (
                <Badge variant="outline" className="px-2 py-0 text-[11px] font-normal">
                  {project.genre}
                </Badge>
              )}
              {project.platform && (
                <Badge variant="outline" className="px-2 py-0 text-[11px] font-normal">
                  {project.platform}
                </Badge>
              )}
              <Badge variant="outline" className="px-2 py-0 text-[11px] font-normal">
                {formatDuration(project.targetDuration)}
              </Badge>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={status.variant}>{status.label}</Badge>
            {isFreeVideoExpiring && (
              isVideoExpired ? (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
                  Video kedaluwarsa
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">
                  ⏳ Video 24 jam
                </span>
              )
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Thin progress bar ala YouTube — 0/3..3/3 langkah */}
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted-foreground/20">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round((completedSteps / 3) * 100)}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {completedSteps}/3
          </span>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <span className="text-xs text-muted-foreground">
            {new Date(project.updatedAt).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Hapus project"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary">
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );



  
}
