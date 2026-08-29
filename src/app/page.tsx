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
  Sparkles,
  Loader2,
} from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { Project } from "@/lib/types";

const STATUS_MAP: Record<string, { label: string; variant: "secondary" | "success" | "warning" }> = {
  draft: { label: "Draft", variant: "secondary" },
  processing: { label: "Diproses", variant: "warning" },
  completed: { label: "Selesai", variant: "success" },
};

export default function DashboardPage() {
  const router = useRouter();
  const { projects, loadProjects, deleteProject, createProject } = useProjectStore();

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreateNew = async () => {
    const project = await createProject({
      genre: "edukasi",
      customGenre: undefined,
      topic: "",
      tone: "kasual",
      targetDuration: 60,
      platform: "tiktok",
      mode: "step-by-step",
      voiceName: "Sari",
      voiceLanguage: "id-ID",
      voiceSpeed: 1.0,
      voiceEmotion: "netral",
      visualStyle: "stock",
    });
    if (project?.id) {
      router.push(`/project/${project.id}`);
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
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Kelola dan buat konten baru dengan Faza Studio
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2">
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
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Project</CardTitle>
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
              <CardTitle className="text-sm font-medium">Diproses</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">{stats.processing}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Draft</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.drafts}</div>
            </CardContent>
          </Card>
        </div>

        {/* Project List */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Project Terbaru</h2>
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
                <Button size="lg" onClick={handleCreateNew} className="gap-2">
                  <Plus className="h-5 w-5" />
                  Buat Project Pertama
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => router.push(`/project/${project.id}`)}
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

  return (
    <Card className="group hover:shadow-md transition-shadow cursor-pointer" onClick={onOpen}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base line-clamp-1">{project.title}</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{project.genre}</span>
              <span>•</span>
              <span>{project.platform}</span>
              <span>•</span>
              <span>{formatDuration(project.targetDuration)}</span>
            </div>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
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