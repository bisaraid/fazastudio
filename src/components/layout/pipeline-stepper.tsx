"use client";

import { PipelineStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check, FileText, Music, Video } from "lucide-react";

const STEP_ICONS: Record<PipelineStep, typeof FileText> = {
  script: FileText,
  audio: Music,
  subtitle: Music, // subtitle adalah dependency internal — tidak tampil sebagai step visual
  video: Video,
  export: Video, // export tidak dirender — fallback icon (untuk type-safety)
};

const STEP_LABELS: Record<PipelineStep, string> = {
  script: "Script",
  audio: "Audio",
  subtitle: "Subtitle",
  video: "Video",
  export: "Export", // tidak dirender
};

interface PipelineStepperProps {
  currentStep: PipelineStep;
  steps: Record<PipelineStep, "pending" | "generating" | "done" | "error">;
}

// Subtitle adalah dependency internal dari Video — bukan destination step.
// UX final: Setup → Script → Audio → Video. Export sudah tidak jadi step UI.
const STEP_ORDER: PipelineStep[] = ["script", "audio", "video"];

export function PipelineStepper({ currentStep, steps }: PipelineStepperProps) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {/* Setup = langkah pertama (selalu done, karena sudah lewat dari dashboard) */}
        <div className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground">
              <Check className="h-5 w-5" />
            </div>
            <span className="hidden sm:inline text-xs font-medium text-primary">Setup</span>
          </div>
          <div className="flex-1 mx-2">
            <div className="relative h-[2px]">
              <div className="absolute inset-0 bg-primary rounded-full" />
            </div>
          </div>
        </div>

        {STEP_ORDER.map((step, index) => {
          const Icon = STEP_ICONS[step];
          const isCompleted = steps[step] === "done";
          const isCurrent = step === currentStep;
          const isError = steps[step] === "error";

          return (
            <div key={step} className="flex flex-1 items-center">
              {/* Step indicator — non-interaktif, hanya menunjukkan posisi */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300",
                    isCompleted && "border-primary bg-primary text-primary-foreground",
                    isCurrent && !isCompleted && "border-primary text-primary",
                    !isCompleted && !isCurrent && "border-muted-foreground/30 text-muted-foreground/50",
                    isError && "border-destructive text-destructive"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <span
                  className={cn(
                    "hidden sm:inline text-xs font-medium",
                    isCompleted && "text-primary",
                    isCurrent && !isCompleted && "text-primary",
                    !isCompleted && !isCurrent && "text-muted-foreground/50",
                    isError && "text-destructive"
                  )}
                >
                  {STEP_LABELS[step]}
                </span>
              </div>

              {/* Connector line */}
              {index < STEP_ORDER.length - 1 && (
                <div className="flex-1 mx-2">
                  <div className="relative h-[2px]">
                    <div className="absolute inset-0 bg-muted-foreground/20 rounded-full" />
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
                        isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                      )}
                      style={{
                        width: isCompleted
                          ? "100%"
                          : index < currentIndex
                          ? "100%"
                          : "0%",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}