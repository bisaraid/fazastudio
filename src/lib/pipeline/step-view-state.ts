// ============================================================
// D1 — Satu sumber state untuk UI pipeline (script → audio → video).
//
// Fungsi murni: tanpa React, tanpa store, tanpa I/O — supaya bisa diuji
// langsung dan dipakai sebagai satu-satunya sumber kebenaran tampilan.
// Subtitle bukan step UI: ia dependency internal audio → video.
// ============================================================

import type { PipelineStep, StepStatus } from "@/lib/types";

/** Step yang di-render sebagai kartu di halaman konten. */
export type StepKey = "script" | "audio" | "video";

/** Urutan step yang dilihat user. */
export const STEP_ORDER: readonly StepKey[] = ["script", "audio", "video"] as const;

/** Status visual satu step. */
export type StepViewStatus = "locked" | "ready" | "running" | "done" | "error";

export interface StepView {
  step: StepKey;
  status: StepViewStatus;
  /** true bila step ini yang menunggu aksi user berikutnya. */
  current: boolean;
}

export interface StepViewState {
  steps: Record<StepKey, StepView>;
  /** Step yang menunggu aksi user; null saat sistem sedang bekerja. */
  current: StepKey | null;
  /** Step destination yang gagal (untuk kartu error + sticky bar "Coba Lagi"). */
  errorStep: StepKey | null;
  /**
   * Subtitle gagal dibuat. Karena subtitle adalah dependency internal audio,
   * video ikut terkunci dan aksi utama berpindah ke "Buat ulang subtitle".
   */
  subtitleFailed: boolean;
}

export interface StepViewInput {
  /** project.steps dari store (termasuk subtitle/export). */
  steps: Record<PipelineStep, StepStatus>;
  /** progress.isRunning dari usePipeline. */
  isRunning: boolean;
  /** progress.currentStep dari usePipeline (boleh "subtitle"/"export"). */
  currentStep: PipelineStep;
  /** Ada/tidaknya data hasil — jaring pengaman bila steps belum ter-hidrasi. */
  hasScript: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
}

/** subtitle menempel ke audio; export tidak dipakai di UI. */
export function normalizeStep(step: PipelineStep): StepKey | null {
  if (step === "subtitle") return "audio";
  if (step === "export") return null;
  return step;
}

/**
 * Petakan state mentah (store + progress) menjadi state visual per step.
 *
 * Prioritas status per step:
 *   1. running  — isRunning && currentStep (setelah normalisasi) === step
 *   2. error    — steps[step] === "error"
 *   3. done     — steps[step] === "done" atau data hasil sudah ada
 *   4. locked   — dependency (STATUS step sebelumnya) belum "done"
 *   5. ready    — sisanya (siap dikerjakan user)
 *
 * `current` = step yang menunggu aksi user. Prioritas: subtitle gagal (akar
 * masalah lebih dulu) → step error → step "ready" pertama → video saat semua
 * sudah selesai (supaya aksi utama menjadi "Download Video").
 */
export function getStepViewState(input: StepViewInput): StepViewState {
  const { steps, isRunning, currentStep, hasScript, hasAudio, hasVideo } = input;

  const runningKey = isRunning ? normalizeStep(currentStep) : null;

  const done: Record<StepKey, boolean> = {
    script: steps.script === "done" || hasScript,
    audio: steps.audio === "done" || hasAudio,
    video: steps.video === "done" || hasVideo,
  };

  // Subtitle gagal hanya relevan selama audio sudah ada & video belum jadi.
  const subtitleFailed = steps.subtitle === "error" && !done.video;

  const errored: Record<StepKey, boolean> = {
    script: steps.script === "error",
    audio: steps.audio === "error",
    video: steps.video === "error",
  };

  // Subtitle belum selesai (masih diproses atau gagal) → video belum boleh
  // dijanjikan "ready": kalau dijalankan pasti gagal di server.
  const subtitleBlocking = steps.subtitle === "error" || steps.subtitle === "generating";

  const status = {} as Record<StepKey, StepViewStatus>;
  for (const step of STEP_ORDER) {
    // Dependency memakai STATUS step sebelumnya (bukan sekadar data ada),
    // supaya audio yang error/still running tidak "membuka" video.
    const previous: StepKey | null = step === "script" ? null : step === "audio" ? "script" : "audio";
    const dependencyOk =
      previous === null
        ? true
        : status[previous] === "done" && (step !== "video" || !subtitleBlocking);

    if (runningKey === step) status[step] = "running";
    else if (errored[step]) status[step] = "error";
    else if (done[step]) status[step] = "done";
    else if (!dependencyOk) status[step] = "locked";
    else status[step] = "ready";
  }

  let errorStep: StepKey | null = null;
  for (const step of STEP_ORDER) {
    if (status[step] === "error") {
      errorStep = step;
      break;
    }
  }

  let current: StepKey | null = null;
  if (!isRunning) {
    if (subtitleFailed) current = "audio";
    else if (errorStep) current = errorStep;
    else {
      const ready = STEP_ORDER.find((step) => status[step] === "ready");
      if (ready) current = ready;
      else if (STEP_ORDER.every((step) => status[step] === "done")) current = "video";
    }
  }

  return {
    steps: {
      script: { step: "script", status: status.script, current: current === "script" },
      audio: { step: "audio", status: status.audio, current: current === "audio" },
      video: { step: "video", status: status.video, current: current === "video" },
    },
    current,
    errorStep,
    subtitleFailed,
  };
}
