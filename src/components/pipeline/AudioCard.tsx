"use client";
import { Button } from "@/components/ui/button";
import type { AudioResult } from "@/lib/types";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { PipelineCard, CardMode } from "./PipelineCard";
import { AudioPlayer } from "./media";

export interface AudioCardProps {
  mode: CardMode;
  audio?: AudioResult;
  onRegenAudio: () => void;
  /** D7: subtitle (dependency internal) gagal → retry dari kartu audio. */
  onRetrySubtitle: () => void;
  disabled: boolean;
  /** D2: step ini yang menunggu aksi user → kartu tidak auto-collapse. */
  isCurrent?: boolean;
  /** D6: pesan error step ini. */
  errorMessage?: string | null;
  /** D7: subtitle gagal → blok error + "Buat ulang subtitle". */
  subtitleFailed?: boolean;
  subtitleErrorMessage?: string | null;
  /** D4: 1 baris penjelasan saat kartu terkunci. */
  lockedHint?: string;
  progress?: number;
  statusMessage?: string;
  showPercent?: boolean;
  /** D8: proses >20 dtk → peringatan jangan tutup halaman. */
  slow?: boolean;
}

export function AudioCard(p: AudioCardProps) {
  const summary = p.audio ? `Audio siap · ${p.audio.provider || "Standar"}` : undefined;
  return (
    <PipelineCard
      mode={p.mode}
      stepLabel="Langkah 2 · Audio"
      summary={summary}
      forceOpen={p.isCurrent}
      lockedHint={p.lockedHint}
      progress={p.progress}
      statusMessage={p.statusMessage}
      showPercent={p.showPercent}
      slow={p.slow}
      errorTitle="Gagal membuat audio"
      errorMessage={p.errorMessage}
      onRetry={p.onRegenAudio}
    >
      {p.audio && <AudioPlayer src={p.audio.url} />}

      {p.mode === "ready" && (
        <p className="text-xs text-muted-foreground">
          Script sudah siap. Tekan tombol{" "}
          <span className="font-medium text-foreground">Buat Audio &amp; Video</span> di bar
          bawah — audio, subtitle, lalu video dibuat berurutan.
        </p>
      )}

      {/* D7: subtitle gagal → jangan dead-end, beri aksi konkret */}
      {p.subtitleFailed && (
        <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Gagal membuat subtitle
          </p>
          <p className="text-xs text-destructive/90">
            {p.subtitleErrorMessage ||
              "Subtitle otomatis gagal dibuat. Buat ulang supaya bisa lanjut ke video."}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={p.onRetrySubtitle}
            disabled={p.disabled}
            className="h-11 w-full gap-1.5 sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" /> Buat ulang subtitle
          </Button>
        </div>
      )}

      {p.audio && p.mode !== "error" && !p.subtitleFailed && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={p.onRegenAudio}
            disabled={p.disabled}
            className="h-11 gap-1.5"
          >
            <RefreshCw className="h-4 w-4" /> Ulangi Audio
          </Button>
        </div>
      )}
    </PipelineCard>
  );
}
