"use client";
import { Button } from "@/components/ui/button";
import type { AudioResult } from "@/lib/types";
import { ArrowDown, RefreshCw } from "lucide-react";
import { PipelineCard, CardMode } from "./PipelineCard";
import { AudioPlayer } from "./media";

export interface AudioCardProps {
  mode: CardMode;
  audio?: AudioResult;
  onContinueVideo: () => void;
  onRegenAudio: () => void;
  disabled: boolean;
  running?: boolean;
  progress?: number;
  statusMessage?: string;
}

export function AudioCard(p: AudioCardProps) {
  const summary = p.audio ? `Audio siap · ${p.audio.provider || "Standar"}` : undefined;
  return (
    <PipelineCard
      mode={p.mode}
      stepLabel="Langkah 2 · Audio"
      summary={summary}
      running={p.running}
      progress={p.progress}
      statusMessage={p.statusMessage}
    >
      {p.audio && <AudioPlayer src={p.audio.url} />}
      {p.audio && (
        <div className="flex gap-2">
          <Button size="sm" onClick={p.onContinueVideo} disabled={p.disabled} className="gap-1.5">
            <ArrowDown className="h-4 w-4" /> Lanjut ke Video
          </Button>
          <Button size="sm" variant="outline" onClick={p.onRegenAudio} disabled={p.disabled} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Ulangi Audio
          </Button>
        </div>
      )}
    </PipelineCard>
  );
}