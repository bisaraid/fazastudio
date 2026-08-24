"use client";

import { PipelineStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check, FileText, Music, Video, Download } from "lucide-react";

const STEP_ICONS: Record<PipelineStep, typeof FileText> = {
  script: FileText,
  audio: Music,
  subtitle: Music, // subtitle adalah dependency internal — tidak tampil sebagai step visual
  video: Video,
  export: Download,
};

const STEP_LABELS: Record<PipelineStep, string> = {
  script: "Script",
  audio: "Audio",
  subtitle: "Subtitle", // tetap ada di type, tapi tidak dirender sebagai step
  video: "Video",
  export: "Export",
};

interface PipelineStepperProps {
  currentStep: PipelineStep;
  steps: Record<PipelineStep, "pending" | "generating" | "done" | "error">;
  onStepClick?: (step: PipelineStep) => void;
}

// Subtitle adalah dependency internal dari Video — bukan destination step.
// UX final: Script → Audio → Video → Export.
const STEP_ORDER: PipelineStep[] = ["script", "audio", "video", "export"];

export function PipelineStepper({ currentStep, steps, onStepClick }: PipelineStepperProps) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {STEP_ORDER.map((step, index) => {
          const Icon = STEP_ICONS[step];
          const isCompleted = steps[step] === "done";
          const isCurrent = step === currentStep;
          const isError = steps[step] === "error";
          const isClickable = index <= currentIndex + 1 && onStepClick;

          return (
            <div key={step} className="flex flex-1 items-center">
              {/* Step indicator */}
              <button
                onClick={() => isClickable && onStepClick?.(step)}
                disabled={!isClickable}
                className={cn(
                  "flex flex-col items-center gap-1.5 transition-all",
                  isClickable ? "cursor-pointer" : "cursor-default",
                  isCurrent && "step-active"
                )}
              >
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
              </button>

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