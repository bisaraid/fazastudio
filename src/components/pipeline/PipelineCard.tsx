"use client";
import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

export type CardMode = "idle" | "active" | "done";

export interface PipelineCardProps {
  mode: CardMode;
  stepLabel: string;
  /** Summary 1-baris untuk mode "done" (collapsed). */
  summary?: string;
  running?: boolean;
  progress?: number;
  statusMessage?: string;
  /** Tampilkan bar % persen (video via SSE). Default false. */
  showPercent?: boolean;
  /** Langkah "thinking" yang muncul satu per satu saat running. */
  thinkSteps?: string[];
  thinkActiveIndex?: number;
  children?: ReactNode;
}

/**
 * Shell kartu pipeline dengan 3 mode:
 *  - idle  : belum dikerjakan → collapsed (placeholder lock)
 *  - active: sedang proses ATAU baru selesai → expanded (+ progress bilabila)
 *  - done  : selesai & auto-collapse → summary 1-baris + tombol expand
 */
export function PipelineCard({
  mode,
  stepLabel,
  summary,
  running,
  progress,
  statusMessage,
  showPercent,
  thinkSteps,
  thinkActiveIndex,
  children,
}: PipelineCardProps) {
  const [open, setOpen] = useState(false);
  const contentId = `pipeline-${stepLabel.trim().replace(/\s+/g, "-").toLowerCase()}`;

  const header = (icon: ReactNode, right: ReactNode) => (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium text-foreground">{stepLabel}</span>
      </div>
      {right}
    </div>
  );

  if (mode === "idle") {
    return null;
  }

  if (mode === "active") {
    return (
      <Card key={mode} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
        <CardContent className="p-5 space-y-3">
          {header(
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
            running ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {statusMessage || "Mengerjakan..."}
              </span>
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            )
          )}
          {/* Thinking steps — script/audio/subtitle (muncul satu per satu) */}
          {running && thinkSteps && thinkSteps.length > 0 && (
            <ul className="space-y-1.5">
              {thinkSteps.map((s, i) => {
                const shown = i <= (thinkActiveIndex ?? 0);
                return (
                  <li
                    key={s}
                    className={`flex items-center gap-2 text-xs transition-all duration-300 ${
                      shown ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
                    }`}
                  >
                    {shown ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-border" />
                    )}
                    <span className={shown ? "text-foreground" : "text-muted-foreground"}>{s}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Progress % — hanya untuk video (data SSE riil) */}
          {running && showPercent && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${progress || 0}%` }}
              />
            </div>
          )}
          {children}
        </CardContent>
      </Card>
    );
  }

  // done — collapsed by default, expandable
  return (
    <Card key={mode} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 opacity-60">
      <CardContent className="p-4 space-y-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium text-foreground">{stepLabel}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {summary && <span className="truncate max-w-[14rem]">{summary}</span>}
            <span>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
          </span>
        </button>
        <div id={contentId}>{open && children}</div>
      </CardContent>
    </Card>
  );
}