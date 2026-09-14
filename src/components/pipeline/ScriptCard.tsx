"use client";
import { type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { providerLabel, VOICE_EMOTIONS } from "@/lib/constants";
import type { ScriptResult } from "@/lib/types";
import { ArrowDown, Headphones, Loader2, Play, RefreshCw } from "lucide-react";
import { PipelineCard, CardMode } from "./PipelineCard";

export interface ScriptCardProps {
  mode: CardMode;
  script?: ScriptResult;
  audioProvider: "google" | "cartesia" | "elevenlabs";
  onAudioProvider: (p: "google" | "cartesia" | "elevenlabs") => void;
  audioSpeed: number;
  onAudioSpeed: (v: number) => void;
  audioEmotion: string;
  onAudioEmotion: (v: string) => void;
  previewUrl: string | null;
  previewLoading: boolean;
  previewError: string | null;
  previewRef: RefObject<HTMLAudioElement>;
  onPreview: () => void;
  onContinueAudio: () => void;
  onRegenScript: () => void;
  disabled: boolean;
  running?: boolean;
  progress?: number;
  statusMessage?: string;
}

export function ScriptCard(p: ScriptCardProps) {
  const summary = p.script
    ? `${p.script.scenes?.length ?? 0} scene · ${p.script.wordCount ?? 0} kata`
    : undefined;

  const audioOptions = p.script && (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground">Suara</label>
        <div className="flex flex-wrap gap-2">
          {(["cartesia", "elevenlabs", "google"] as const).map((prov) => (
            <button
              key={prov}
              type="button"
              onClick={() => p.onAudioProvider(prov)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                p.audioProvider === prov
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {p.audioProvider === prov && <Play className="h-3 w-3" />}
              {providerLabel(prov)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Kecepatan</label>
          <select
            value={p.audioSpeed}
            onChange={(e) => p.onAudioSpeed(Number(e.target.value))}
            className="rounded-lg border bg-card px-2 py-1.5 text-xs outline-none focus:border-primary"
          >
            <option value={0.8}>0.8×</option>
            <option value={1.0}>1.0×</option>
            <option value={1.2}>1.2×</option>
            <option value={1.5}>1.5×</option>
          </select>
        </div>
      </div>

      {p.audioProvider === "cartesia" && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Emosi</label>
          <select
            value={p.audioEmotion}
            onChange={(e) => p.onAudioEmotion(e.target.value)}
            className="w-full rounded-lg border bg-card px-2 py-1.5 text-xs outline-none focus:border-primary"
          >
            {VOICE_EMOTIONS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Preview */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={p.onPreview}
          disabled={p.previewLoading || p.disabled}
          className="gap-1.5"
        >
          <Headphones className="h-4 w-4" />
          {p.previewLoading ? "Membuat preview..." : "Dengar Preview"}
        </Button>
        {p.previewError && <span className="text-xs text-destructive">{p.previewError}</span>}
      </div>
      {p.previewUrl && (
        <audio ref={p.previewRef} src={p.previewUrl} autoPlay className="hidden" />
      )}
    </div>
  );

  const actions = p.script && (
    <div className="flex gap-2">
      <Button size="sm" onClick={p.onContinueAudio} disabled={p.disabled} className="gap-1.5">
        <ArrowDown className="h-4 w-4" /> Lanjut ke Audio
      </Button>
      <Button size="sm" variant="outline" onClick={p.onRegenScript} disabled={p.disabled} className="gap-1.5">
        <RefreshCw className="h-4 w-4" /> Ulangi Script
      </Button>
    </div>
  );

  return (
    <PipelineCard
      mode={p.mode}
      stepLabel="Langkah 1 · Script"
      summary={summary}
      running={p.running}
      progress={p.progress}
      statusMessage={p.statusMessage}
    >
      {p.script && (
        <div className="max-h-72 overflow-y-auto rounded-lg bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {p.script.fullScript}
        </div>
      )}
      {audioOptions}
      {actions}
    </PipelineCard>
  );
}