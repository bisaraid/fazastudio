"use client";
import type { VideoResult } from "@/lib/types";
import { Download } from "lucide-react";
import { PipelineCard, CardMode } from "./PipelineCard";
import { VideoPlayer, makeDataUrl } from "./media";

export interface VideoCardProps {
  mode: CardMode;
  video?: VideoResult;
  audioUrl?: string | null;
  srtContent?: string;
  vttContent?: string;
  running?: boolean;
  progress?: number;
  statusMessage?: string;
}

export function VideoCard(p: VideoCardProps) {
  const summary = p.video ? "Video siap" : undefined;
  return (
    <PipelineCard
      mode={p.mode}
      stepLabel="Langkah 3 · Video"
      summary={summary}
      running={p.running}
      progress={p.progress}
      statusMessage={p.statusMessage}
    >
      {p.video && <VideoPlayer src={p.video.url} />}
      {p.video && (
        <div className="flex gap-2">
          {p.audioUrl && (
            <a
              href={p.audioUrl}
              download
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-4 py-2 text-sm hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Download Audio
            </a>
          )}
          <a
            href={p.video.url}
            download
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-4 w-4" /> Download Video
          </a>
        </div>
      )}
      {p.srtContent && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-2">
            <a
              href={makeDataUrl(p.srtContent, "text/plain")}
              download="kapten.srt"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-4 py-2 text-sm hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Download SRT
            </a>
            <a
              href={makeDataUrl(p.vttContent || p.srtContent, "text/plain")}
              download="kapten.vtt"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-4 py-2 text-sm hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Download VTT
            </a>
          </div>
        </div>
      )}
    </PipelineCard>
  );
}