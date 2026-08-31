"use client";

import { useEffect, useState } from "react";
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
  type LucideIcon,
} from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { Genre, Platform, Project } from "@/lib/types";
import { NICHES } from "@/lib/persona-data";

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

function platformForMode(mode: string): Platform {
  return mode === "jualan" ? "tiktok" : "tiktok";
}

function nicheLabel(niche: string): string {
  const all = [...NICHES.jualan, ...NICHES.konten];
  return all.find((n) => n.slug === niche)?.label ?? niche;
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

export default function DashboardPage() {
  const router = useRouter();
  const { projects, loadProjects, deleteProject, createProject } = useProjectStore();
  const [profile, setProfile] = useState<{ mode: string; niche: string } | null>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.success || !data?.data) return;
        setProfile({
          mode: data.data.layer1_mode as string,
          niche: data.data.niche_slug as string,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateNew = async () => {
    const niche = profile?.niche ?? "";
    const mode = profile?.mode ?? "";
    const project = await createProject({
      genre: genreForNiche(mode, niche),
      customGenre: undefined,
      topic: "",
      tone: "kasual",
      targetDuration: 30,
      platform: platformForMode(mode),
      mode: "step-by-step",
      voiceName: "Sari",
      voiceLanguage: "id-ID",
      voiceSpeed: 1.0,
      voiceEmotion: "netral",
      visualStyle: "stock",
    });
    if (project?.id) {
      router.push(`/konten/${project.id}`);
    }
  };

  // FIX 2 — bungkus handleCreateNew dengan loading + error state.
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateClick = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      await handleCreateNew();
    } catch {
      setCreateError("Gagal membuat konten. Coba lagi.");
    } finally {
      setIsCreating(false);
    }
  };

  // FIX 1 — hapus dengan konfirmasi + feedback error.
  const handleDeleteProject = async (projectId: string) => {
    const confirmed = confirm("Hapus project ini? Tindakan tidak bisa dibatalkan.");
    if (!confirmed) return;
    try {
      await deleteProject(projectId);
    } catch {
      alert("Gagal menghapus project. Coba lagi.");
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
                <Button
                  size="lg"
                  className="gap-2"
                  onClick={handleCreateClick}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                  {isCreating ? "Membuat..." : "Buat Konten Baru"}
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
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Selesai</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-500">{stats.completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Sedang diproses</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">{stats.processing}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Belum jadi</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.drafts}</div>
            </CardContent>
          </Card>
        </div>

        {/* Project List */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Konten terbaru</h2>
          {projects.length === 0 ? (
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
                <Button size="lg" onClick={handleCreateClick} disabled={isCreating} className="gap-2">
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {isCreating ? "Membuat..." : "Buat Project Pertama"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => router.push(`/konten/${project.id}`)}
                  onDelete={() => handleDeleteProject(project.id)}
                />
              ))}
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
      {project.video?.url ? (
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <video
            src={project.video.url}
            className="h-full w-full object-cover"
            muted
            preload="metadata"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="h-8 w-8 text-white" />
          </div>
        </div>
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