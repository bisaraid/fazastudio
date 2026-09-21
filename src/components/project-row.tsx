"use client";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";
import { Trash2, ArrowRight, Loader2 } from "lucide-react";
import { Project } from "@/lib/types";

const STATUS_MAP = {
  draft: { label: "Belum jadi", variant: "secondary" },
  processing: { label: "Sedang diproses", variant: "warning" },
  completed: { label: "Selesai", variant: "success" },
};

export function ProjectRow({ project, onOpen, onDelete, deleting }: {
  project: Project;
  onOpen: ()=> void;
  onDelete: ()=> void;
  deleting?: boolean;
}){ 
  const status = STATUS_MAP[project.status];
  const completed = ["script","audio","video"] .filter((s) => s === "done").length;
  const title = project.title?.trim() || project.topic?.trim() || "Proyek tanpa judul";
  const date = new Date(project.updatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return (
  <div className="flex w-full items-center gap-3 rounded-xl border bg-card p-3" onClick={onOpen}>
   <div className="min-w-0 flex-1">
    <div className="flex items-center gap-2">
     <span className="truncate font-medium text-foreground">{title}</span>
    <Badge variant={status.variant as "secondary"| "warning"| "success"}>{status.label}</Badge>
    </div>
    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
    {project.genre ? <span>{project.genre}</span> : null}
    {project.genre && project.platform ? <span>·</span> : null}
    {project.platform ? <span>{project.platform}</span> : null}
    {project.platform ? <span>·</span> : null}
    <span>{formatDuration(project.targetDuration)}</span>
    </div>
  </div>
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <span className="tabular-nums">{completed}/3</span>
    <span>{date}</span>
    <button type="button" disabled={deleting} onClick={(e) => {e.stopPropagation(); onDelete();}} aria-label="Hapus project" className="inline-flex h-8 w-auto items-center gap-1 rounded p-1.5 text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50">
     {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
    <ArrowRight className="h-4 w-4" />
  </div>
  </div>
  );
}