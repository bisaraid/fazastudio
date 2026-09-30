"use client";
import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  Lock,
  RefreshCw,
} from "lucide-react";

/**
 * Status visual kartu — 1:1 dengan StepViewStatus (D1).
 *  - locked : dependency belum selesai → kompak, tanpa aksi
 *  - ready  : siap dikerjakan user → expanded + aksi utama
 *  - running: sedang diproses → expanded + spinner + status
 *  - done   : selesai → collapsed (summary + expand), kecuali masih step `current`
 *  - error  : gagal → expanded + blok error + tombol retry
 */
export type CardMode = "locked" | "ready" | "running" | "done" | "error";

export interface PipelineCardProps {
  mode: CardMode;
  stepLabel: string;
  /** Summary 1-baris untuk mode "done" (collapsed). */
  summary?: string;
  /** Override deteksi running (default: mode === "running"). */
  running?: boolean;
  progress?: number;
  statusMessage?: string;
  /** Tampilkan bar % persen (video via SSE). Default false. */
  showPercent?: boolean;
  /** D8: proses berjalan >20 dtk → tampilkan peringatan "jangan tutup halaman". */
  slow?: boolean;
  /** D6: judul error, mis. "Gagal membuat audio". */
  errorTitle?: string;
  /** D6: pesan error dari server. */
  errorMessage?: string | null;
  /** D6: aksi retry (wajib saat mode error supaya tidak dead-end). */
  onRetry?: () => void;
  retryLabel?: string;
  /** D2: step yang menunggu aksi user tidak pernah auto-collapse. */
  forceOpen?: boolean;
  /** D4: 1 baris penjelasan untuk kartu terkunci. */
  lockedHint?: string;
  children?: ReactNode;
}

export function PipelineCard({
  mode,
  stepLabel,
  summary,
  running,
  progress,
  statusMessage,
  showPercent,
  slow,
  errorTitle,
  errorMessage,
  onRetry,
  retryLabel = "Coba Lagi",
  forceOpen,
  lockedHint,
  children,
}: PipelineCardProps) {
  const [open, setOpen] = useState(false);
  const isRunning = running ?? mode === "running";
  const contentId = `pipeline-${stepLabel.trim().replace(/\s+/g, "-").toLowerCase()}`;

  const header = (icon: ReactNode, right: ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate text-sm font-medium text-foreground">{stepLabel}</span>
      </div>
      {right}
    </div>
  );

  /** D5: ikon header mengikuti state — centang hijau HANYA saat done. */
  const stateIcon = () => {
    if (mode === "locked") return <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />;
    if (mode === "error") return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />;
    if (mode === "running") return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
    if (mode === "ready") return <Circle className="h-4 w-4 shrink-0 text-muted-foreground/60" />;
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  };


  // ===== locked: kompak, tanpa aksi (D4 minimal) =====
  if (mode === "locked") {
    return (
      <Card className="border-dashed opacity-70">
        <CardContent className="p-4">
          {header(stateIcon(), <span className="shrink-0 text-xs text-muted-foreground">Terkunci</span>)}
          {lockedHint && <p className="mt-1.5 text-xs text-muted-foreground">{lockedHint}</p>}
        </CardContent>
      </Card>
    );
  }

  // ===== ready / running / error / done(current): expanded =====
  return (
    <Card
      key={mode}
      className={`animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ${
        mode === "done" ? "opacity-60" : ""
      }`}
    >
      <CardContent className="p-5 space-y-3">
        {mode === "done" && !forceOpen ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={contentId}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              {stateIcon()}
              <span className="truncate text-sm font-medium text-foreground">{stepLabel}</span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {summary && <span className="truncate max-w-[14rem]">{summary}</span>}
              <span>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
            </span>
          </button>
        ) : (
          header(
            stateIcon(),
            isRunning ? (
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="max-w-[10rem] truncate">{statusMessage || "Mengerjakan..."}</span>
              </span>
            ) : summary ? (
              <span className="shrink-0 truncate text-xs text-muted-foreground">{summary}</span>
            ) : null
          )
        )}
        {/*
          D8: satu bar progres per step. Angka riil (video via SSE) → determinate;
          sebelum ada angka (script/audio/subtitle, fase antre render) →
          indeterminate. Tidak ada lagi think-steps berbasis timer.
        */}
        {isRunning && (
          <div className="space-y-1.5">
            <div
              role="progressbar"
              aria-valuemin={showPercent ? 0 : undefined}
              aria-valuemax={showPercent ? 100 : undefined}
              aria-valuenow={showPercent ? Math.round(progress || 0) : undefined}
              aria-valuetext={showPercent ? undefined : statusMessage || "Sedang diproses"}
              className="h-1 w-full overflow-hidden rounded-full bg-muted"
            >
              {showPercent && (progress || 0) > 0 ? (
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${progress || 0}%` }}
                />
              ) : (
                <div className="bar-indeterminate h-full w-1/3 rounded-full bg-primary" />
              )}
            </div>
            {slow && (
              <p className="text-xs text-muted-foreground">
                Masih diproses, jangan tutup halaman.
              </p>
            )}
          </div>
        )}

        {mode === "done" && !forceOpen ? <div id={contentId}>{open && children}</div> : children}

        {/* D6: error tampil di kartu yang gagal + retry (tidak ada dead-end) */}
        {mode === "error" && (
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {errorTitle || "Gagal di langkah ini"}
            </p>
            <p className="text-xs text-destructive/90">{errorMessage || "Terjadi kesalahan. Coba lagi."}</p>
            {onRetry && (
              <Button type="button" size="sm" onClick={onRetry} className="h-11 w-full gap-1.5 sm:w-auto">
                <RefreshCw className="h-4 w-4" /> {retryLabel}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
