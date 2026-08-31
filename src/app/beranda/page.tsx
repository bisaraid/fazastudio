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
      {/* Thumbnail video — Tampil jika project sudah punya video */}
      {project.video?.url && (
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
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base line-clamp-1">{cardTitle}</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{project.genre}</span>
              <span>•</span>
              <span>{project.platform}</span>
              <span>•</span>
              <span>{formatDuration(project.targetDuration)}</span>
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
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <span>Progress:</span>
            <span className="font-medium text-foreground">
              {completedSteps}/3
            </span>
          </div>
          <div className="flex items-center gap-1">
            {(["script", "audio", "video"] as const).map((step) => {
              const stepStatus = project.steps[step];
              return (
                <div
                  key={step}
                  className={`h-2 w-2 rounded-full ${
                    stepStatus === "done"
                      ? "bg-primary"
                      : stepStatus === "generating"
                      ? "bg-amber-500 animate-pulse"
                      : "bg-muted-foreground/20"
                  }`}
                />
              );
            })}
          </div>
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