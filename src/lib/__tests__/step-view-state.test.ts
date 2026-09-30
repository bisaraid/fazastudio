import { test, expect, describe } from "vitest";
import {
  getStepViewState,
  normalizeStep,
  STEP_ORDER,
  type StepViewInput,
} from "@/lib/pipeline/step-view-state";
import type { PipelineStep, StepStatus } from "@/lib/types";

/** Helper: bikin steps dengan nilai default "pending". */
function steps(patch: Partial<Record<PipelineStep, StepStatus>> = {}) {
  return {
    script: "pending",
    audio: "pending",
    subtitle: "pending",
    video: "pending",
    export: "pending",
    ...patch,
  } as Record<PipelineStep, StepStatus>;
}

/** Helper: input default (project baru, belum ada apa-apa). */
function input(patch: Partial<StepViewInput> = {}): StepViewInput {
  return {
    steps: steps(),
    isRunning: false,
    currentStep: "script",
    hasScript: false,
    hasAudio: false,
    hasVideo: false,
    ...patch,
  };
}

/** Helper: status ringkas per step. */
function statuses(i: StepViewInput) {
  const s = getStepViewState(i);
  return {
    script: s.steps.script.status,
    audio: s.steps.audio.status,
    video: s.steps.video.status,
  };
}

describe("normalizeStep", () => {
  test("subtitle menempel ke audio (bukan step UI)", () => {
    expect(normalizeStep("subtitle")).toBe("audio");
  });

  test("export tidak dipakai di UI", () => {
    expect(normalizeStep("export")).toBeNull();
  });

  test("script/audio/video apa adanya", () => {
    expect(normalizeStep("script")).toBe("script");
    expect(normalizeStep("audio")).toBe("audio");
    expect(normalizeStep("video")).toBe("video");
  });
});

describe("getStepViewState — progresi normal", () => {
  test("project kosong: script ready, sisanya locked, current = script", () => {
    const s = getStepViewState(input());
    expect(statuses(input())).toEqual({ script: "ready", audio: "locked", video: "locked" });
    expect(s.current).toBe("script");
    expect(s.errorStep).toBeNull();
    expect(s.subtitleFailed).toBe(false);
    expect(s.steps.script.current).toBe(true);
  });

  test("script sedang berjalan: running + current null (sistem bekerja)", () => {
    const i = input({ steps: steps({ script: "generating" }), isRunning: true, currentStep: "script" });
    const s = getStepViewState(i);
    expect(statuses(i)).toEqual({ script: "running", audio: "locked", video: "locked" });
    expect(s.current).toBeNull();
  });

  test("script selesai: script done, audio ready (current), video locked", () => {
    const i = input({ steps: steps({ script: "done" }), hasScript: true });
    const s = getStepViewState(i);
    expect(statuses(i)).toEqual({ script: "done", audio: "ready", video: "locked" });
    expect(s.current).toBe("audio");
    expect(s.steps.audio.current).toBe(true);
  });

  test("audio sedang berjalan: current null", () => {
    const i = input({
      steps: steps({ script: "done", audio: "generating" }),
      isRunning: true,
      currentStep: "audio",
      hasScript: true,
    });
    const s = getStepViewState(i);
    expect(statuses(i)).toEqual({ script: "done", audio: "running", video: "locked" });
    expect(s.current).toBeNull();
  });

  test("subtitle (internal) sedang berjalan tampil sebagai audio running", () => {
    const i = input({
      steps: steps({ script: "done", audio: "done", subtitle: "generating" }),
      isRunning: true,
      currentStep: "subtitle",
      hasScript: true,
      hasAudio: true,
    });
    expect(statuses(i)).toEqual({ script: "done", audio: "running", video: "locked" });
    expect(getStepViewState(i).current).toBeNull();
  });

  test("audio selesai: video ready (current) — kartu video tidak pernah kosong", () => {
    const i = input({
      steps: steps({ script: "done", audio: "done", subtitle: "done" }),
      hasScript: true,
      hasAudio: true,
    });
    const s = getStepViewState(i);
    expect(statuses(i)).toEqual({ script: "done", audio: "done", video: "ready" });
    expect(s.current).toBe("video");
    expect(s.steps.video.current).toBe(true);
  });

  test("video sedang berjalan: video running, current null", () => {
    const i = input({
      steps: steps({ script: "done", audio: "done", subtitle: "done", video: "generating" }),
      isRunning: true,
      currentStep: "video",
      hasScript: true,
      hasAudio: true,
    });
    expect(statuses(i)).toEqual({ script: "done", audio: "done", video: "running" });
    expect(getStepViewState(i).current).toBeNull();
  });

  test("semua selesai: current = video (aksi utama menjadi Download Video)", () => {
    const i = input({
      steps: steps({ script: "done", audio: "done", subtitle: "done", video: "done" }),
      hasScript: true,
      hasAudio: true,
      hasVideo: true,
    });
    const s = getStepViewState(i);
    expect(statuses(i)).toEqual({ script: "done", audio: "done", video: "done" });
    expect(s.current).toBe("video");
    expect(s.errorStep).toBeNull();
  });
});

describe("getStepViewState — error per step", () => {
  test("script gagal: error + current script + errorStep script", () => {
    const i = input({ steps: steps({ script: "error" }) });
    const s = getStepViewState(i);
    expect(statuses(i)).toEqual({ script: "error", audio: "locked", video: "locked" });
    expect(s.current).toBe("script");
    expect(s.errorStep).toBe("script");
  });

  test("audio gagal (script ada): error + current audio + errorStep audio", () => {
    const i = input({ steps: steps({ script: "done", audio: "error" }), hasScript: true });
    const s = getStepViewState(i);
    expect(statuses(i)).toEqual({ script: "done", audio: "error", video: "locked" });
    expect(s.current).toBe("audio");
    expect(s.errorStep).toBe("audio");
  });

  test("audio gagal saat regenerate (audio lama masih ada): error menang atas done", () => {
    const i = input({
      steps: steps({ script: "done", audio: "error", subtitle: "done" }),
      hasScript: true,
      hasAudio: true,
    });
    expect(statuses(i)).toEqual({ script: "done", audio: "error", video: "locked" });
    expect(getStepViewState(i).errorStep).toBe("audio");
  });

  test("video gagal: error + current video + errorStep video", () => {
    const i = input({
      steps: steps({ script: "done", audio: "done", subtitle: "done", video: "error" }),
      hasScript: true,
      hasAudio: true,
    });
    const s = getStepViewState(i);
    expect(statuses(i)).toEqual({ script: "done", audio: "done", video: "error" });
    expect(s.current).toBe("video");
    expect(s.errorStep).toBe("video");
  });

  test("retry sedang berjalan (step generating + isRunning): running, bukan error", () => {
    const i = input({
      steps: steps({ script: "done", audio: "done", subtitle: "done", video: "generating" }),
      isRunning: true,
      currentStep: "video",
      hasScript: true,
      hasAudio: true,
    });
    expect(statuses(i)).toEqual({ script: "done", audio: "done", video: "running" });
    expect(getStepViewState(i).errorStep).toBeNull();
    expect(getStepViewState(i).current).toBeNull();
  });
});

describe("getStepViewState — subtitle gagal (D7)", () => {
  test("subtitle gagal: video terkunci, current audio, subtitleFailed true", () => {
    const i = input({
      steps: steps({ script: "done", audio: "done", subtitle: "error" }),
      hasScript: true,
      hasAudio: true,
    });
    const s = getStepViewState(i);
    expect(statuses(i)).toEqual({ script: "done", audio: "done", video: "locked" });
    expect(s.subtitleFailed).toBe(true);
    expect(s.current).toBe("audio");
    expect(s.errorStep).toBeNull(); // audio sendiri tidak error
  });

  test("subtitle gagal tidak menyisakan aksi video yang pasti gagal", () => {
    const i = input({
      steps: steps({ script: "done", audio: "done", subtitle: "error" }),
      hasScript: true,
      hasAudio: true,
    });
    expect(getStepViewState(i).steps.video.status).toBe("locked");
  });

  test("subtitle gagal + video error: akar masalah (subtitle) yang jadi aksi utama", () => {
    const i = input({
      steps: steps({ script: "done", audio: "done", subtitle: "error", video: "error" }),
      hasScript: true,
      hasAudio: true,
    });
    const s = getStepViewState(i);
    expect(s.subtitleFailed).toBe(true);
    expect(s.errorStep).toBe("video"); // kartu video tahu ia error…
    expect(s.current).toBe("audio"); // …tapi user diarahkan betulkan subtitle dulu
  });

  test("subtitle gagal tapi video sudah jadi (stale): tidak menghambat", () => {
    const i = input({
      steps: steps({ script: "done", audio: "done", subtitle: "error", video: "done" }),
      hasScript: true,
      hasAudio: true,
      hasVideo: true,
    });
    const s = getStepViewState(i);
    expect(s.subtitleFailed).toBe(false);
    expect(statuses(i)).toEqual({ script: "done", audio: "done", video: "done" });
    expect(s.current).toBe("video");
  });

  test("subtitle retry sedang jalan: subtitleFailed reset, audio running", () => {
    const i = input({
      steps: steps({ script: "done", audio: "done", subtitle: "generating" }),
      isRunning: true,
      currentStep: "subtitle",
      hasScript: true,
      hasAudio: true,
    });
    const s = getStepViewState(i);
    expect(s.subtitleFailed).toBe(false);
    expect(s.steps.audio.status).toBe("running");
    expect(s.current).toBeNull();
  });
});


describe("getStepViewState — data hasil & edge", () => {
  test("steps belum ter-hidrasi tapi data ada → done", () => {
    const i = input({
      steps: steps({ script: "pending", audio: "pending" }),
      hasScript: true,
      hasAudio: true,
    });
    const s = getStepViewState(i);
    expect(statuses(i)).toEqual({ script: "done", audio: "done", video: "ready" });
    expect(s.current).toBe("video");
  });

  test("video ada tanpa audio (data inkonsisten): video tetap done", () => {
    const i = input({ hasVideo: true, steps: steps({ video: "done" }) });
    expect(getStepViewState(i).steps.video.status).toBe("done");
  });

  test("currentStep export saat running: tidak ada step yang running", () => {
    const i = input({ isRunning: true, currentStep: "export" });
    const s = getStepViewState(i);
    expect(s.current).toBeNull();
    expect(STEP_ORDER.every((k) => s.steps[k].status !== "running")).toBe(true);
  });

  test("tepat satu step berstatus current pada setiap state non-running", () => {
    const cases: StepViewInput[] = [
      input(),
      input({ steps: steps({ script: "done" }), hasScript: true }),
      input({ steps: steps({ script: "done", audio: "done" }), hasScript: true, hasAudio: true }),
      input({
        steps: steps({ script: "done", audio: "done", subtitle: "done", video: "done" }),
        hasScript: true,
        hasAudio: true,
        hasVideo: true,
      }),
      input({ steps: steps({ script: "error" }) }),
      input({
        steps: steps({ script: "done", audio: "done", subtitle: "error" }),
        hasScript: true,
        hasAudio: true,
      }),
    ];
    for (const c of cases) {
      const s = getStepViewState(c);
      const flagged = STEP_ORDER.filter((k) => s.steps[k].current);
      expect(flagged).toHaveLength(1);
      expect(flagged[0]).toBe(s.current);
    }
  });

  test("saat running tidak ada step yang current (sticky bar hanya spinner + status)", () => {
    const i = input({
      steps: steps({ script: "generating" }),
      isRunning: true,
      currentStep: "script",
    });
    const s = getStepViewState(i);
    expect(s.current).toBeNull();
    expect(STEP_ORDER.some((k) => s.steps[k].current)).toBe(false);
  });
});


