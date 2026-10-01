"use client";
import { Button } from "@/components/ui/button";
import type { VideoResult } from "@/lib/types";
import { CheckCircle2, Download } from "lucide-react";
import { PipelineCard, CardMode } from "./PipelineCard";
import { VideoPlayer, makeDataUrl } from "./media";

export interface VideoCardProps {
  mode: CardMode;
  video?: VideoResult;
  audioUrl?: string | null;
  srtContent?: string;
  vttContent?: string;
  /** Aksi retry render video (dipakai blok error D6). */
  onStartVideo: () => void;
  /** D2: step ini yang menunggu aksi user → kartu tidak auto-collapse. */
  isCurrent?: boolean;
  /** D6: pesan error step ini. */
  errorMessage?: string | null;
  /** D4: 1 baris penjelasan saat kartu terkunci. */
  lockedHint?: string;
  progress?: number;
  statusMessage?: string;
  showPercent?: boolean;
  /** D8: proses >20 dtk → peringatan jangan tutup halaman. */
  slow?: boolean;
}

export function VideoCard(p: VideoCardProps) {
  const summary = p.video ? "Video siap" : undefined;
  return (
    <PipelineCard
      mode={p.mode}
      stepLabel="Langkah 3 · Video"
      summary={summary}
      forceOpen={p.isCurrent}
      lockedHint={p.lockedHint}
      progress={p.progress}
      statusMessage={p.statusMessage}
      showPercent={p.showPercent}
      slow={p.slow}
      errorTitle="Gagal membuat video"
      errorMessage={p.errorMessage}
      onRetry={p.onStartVideo}
    >
      {/* D9: hasil selesai → banner jelas + kartu tetap terbuka (forceOpen) */}
      {p.mode === "done" && p.video && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Video siap — unduh di bawah, lalu salin caption setelah kartu ini.
        </div>
      )}

      {p.video && <VideoPlayer src={p.video.url} />}

      {p.mode === "ready" && (
        <p className="text-xs text-muted-foreground">
          Audio &amp; subtitle siap. Tekan tombol{" "}
          <span className="font-medium text-foreground">Buat Video</span> di bar bawah.
        </p>
      )}
      {p.video && (
        <div className="flex flex-wrap gap-2">
          {p.audioUrl && (
            <a
              href={p.audioUrl}
              download
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-4 text-sm hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Download Audio
            </a>
          )}
          <a
            href={p.video.url}
            download
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-4 w-4" /> Download Video
          </a>
        </div>
      )}
      {/* Kredit sumber footage (Pexels API guidelines: tampilkan tautan jelas).
          Satu baris kecil, tidak mengganggu alur unduh. */}
      {p.video && (
        <p className="text-xs text-muted-foreground">
          Video oleh{" "}
          <a
            href="https://www.pexels.com"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Pexels
          </a>
        </p>
      )}
      {p.srtContent && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2">
            <a
              href={makeDataUrl(p.srtContent, "text/plain")}
              download="kapten.srt"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-4 text-sm hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Download SRT
            </a>
            <a
              href={makeDataUrl(p.vttContent || p.srtContent, "text/plain")}
              download="kapten.vtt"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-4 text-sm hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Download VTT
            </a>
          </div>
        </div>
      )}
    </PipelineCard>
  );
}