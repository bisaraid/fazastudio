"use client";
import { useState } from "react";
import { type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { providerLabel, VOICE_EMOTIONS } from "@/lib/constants";
import { useUsage } from "@/hooks/useUsage";
import type { ScriptResult } from "@/lib/types";
import { ChevronDown, Headphones, Loader2, Play, RefreshCw } from "lucide-react";
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
  onRegenScript: () => void;
  disabled: boolean;
  /** D2: step ini yang menunggu aksi user → kartu tidak auto-collapse. */
  isCurrent?: boolean;
  /** D6: pesan error step ini (ditampilkan di dalam kartu). */
  errorMessage?: string | null;
  /** D4: 1 baris penjelasan saat kartu terkunci. */
  lockedHint?: string;
  progress?: number;
  statusMessage?: string;
  showPercent?: boolean;
  /** D8: proses >20 dtk → peringatan jangan tutup halaman. */
  slow?: boolean;
  /** Fase 4B: accordion pengaturan audio dikendalikan halaman (dibuka dari hint sticky bar). */
  audioSettingsOpen?: boolean;
  onAudioSettingsToggle?: (open: boolean) => void;
}

export function ScriptCard(p: ScriptCardProps) {
  const { plan } = useUsage();
  const summary = p.script
    ? `${p.script.scenes?.length ?? 0} scene · ${p.script.wordCount ?? 0} kata`
    : undefined;

  const [audioOpenInternal, setAudioOpenInternal] = useState(false);
  // Fase 4B: kalau halaman mengirim `audioSettingsOpen` (dari hint "Suara: ..."
  // di sticky bar), accordion dikendalikan halaman; jika tidak, state lokal.
  const audioOpen = p.audioSettingsOpen ?? audioOpenInternal;
  const toggleAudio = () =>
    p.onAudioSettingsToggle ? p.onAudioSettingsToggle(!audioOpen) : setAudioOpenInternal(!audioOpen);

  // Controlli audio in accordion chiuso di default — non bloccano il flusso.
  const audioOpenBtn = p.script && (
    <button
      type="button"
      onClick={toggleAudio}
      className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
      aria-expanded={audioOpen}
      aria-controls="script-audio-options"
    >
      <span className="flex items-center gap-2">
        <Headphones className="h-4 w-4" />
        Pengaturan Audio
      </span>
      <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${audioOpen ? "rotate-180" : ""}`} />
    </button>
  );

  const audioOptions = p.script && audioOpen && (
    <div id="script-audio-options" className="space-y-3 rounded-lg border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground">Suara</label>
        <div className="flex flex-wrap gap-2">
          {(["cartesia", "elevenlabs", "google"] as const).map((prov) => {
            const isPaid = prov !== "google";
            const disabled = plan === "free" && isPaid;
            const active = p.audioProvider === prov || (plan === "free" && prov === "google");
            return (
              <button
                key={prov}
                type="button"
                disabled={disabled}
                onClick={() => p.onAudioProvider(prov)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent"
                } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
              >
                {active && <Play className="h-3 w-3" />}
                {providerLabel(prov)}
              </button>
            );
          })}
        </div>
        {plan === "free" && (
          <p className="text-xs text-muted-foreground">
            Plan Gratis hanya tersedia suara Standar. Upgrade untuk suara Premium.
          </p>
        )}
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

  // D3: aksi sekunder tetap di dalam kartu (min 44px). Aksi utama step ini
  // ada di sticky bar; tombol inline hanya untuk state ready.
  const secondary = p.script && p.mode !== "error" && (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={p.onRegenScript}
        disabled={p.disabled}
        className="h-11 gap-1.5"
      >
        <RefreshCw className="h-4 w-4" /> Ulangi Script
      </Button>
      {/* 5A: regenerate script pada project yang sama mendebet 1 kredit bulanan
          (route /api/generate-script selalu memotong 1 kredit). */}
      <span className="text-xs text-muted-foreground">Memakai 1 kredit</span>
    </div>
  );

  return (
    <PipelineCard
      mode={p.mode}
      stepLabel="Langkah 1 · Script"
      summary={summary}
      forceOpen={p.isCurrent}
      lockedHint={p.lockedHint}
      progress={p.progress}
      statusMessage={p.statusMessage}
      showPercent={p.showPercent}
      slow={p.slow}
      errorTitle="Gagal membuat script"
      errorMessage={p.errorMessage}
      onRetry={p.onRegenScript}
    >
      {p.script && (
        <div className="max-h-72 overflow-y-auto rounded-lg bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {p.script.fullScript}
        </div>
      )}
      {p.mode === "ready" && (
        <p className="text-xs text-muted-foreground">
          Tulis topik di panel atas, lalu tekan tombol{" "}
          <span className="font-medium text-foreground">Buat Script</span> di bar bawah.
        </p>
      )}
      {audioOpenBtn}
      {audioOptions}
      {secondary}
    </PipelineCard>
  );
}
