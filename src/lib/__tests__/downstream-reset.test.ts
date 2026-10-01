// ============================================================
// 5A — Invalidasi hilir: unit test (fungsi murni).
// ============================================================
import { test, expect, describe } from "vitest";
import {
  clearedMedia,
  invalidateDownstream,
} from "@/lib/pipeline/downstream-reset";
import type { Project } from "@/lib/types";

function project(patch: Partial<Project> = {}): Project {
  return {
    id: "p-1",
    title: "Judul",
    genre: "edukasi",
    topic: "topik",
    tone: "kasual",
    targetDuration: 60,
    platform: "tiktok",
    mode: "step-by-step",
    status: "completed",
    currentStep: "video",
    steps: { script: "done", audio: "done", subtitle: "done", video: "done", export: "pending" },
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    script: { id: "s1", title: "t", scenes: [], fullScript: "f", estimatedDuration: 5, wordCount: 1 },
    audio: { id: "a1", url: "a.mp3", duration: 5, voiceName: "Sari", language: "id-ID", speed: 1, emotion: "netral" },
    subtitle: {
      id: "sub1",
      entries: [],
      segments: [],
      style: { fontSize: 24, color: "#fff", position: "bottom" },
      srtContent: "LAMA",
      vttContent: "LAMA",
      language: "id",
    },
    video: { id: "v1", url: "v.mp4", duration: 5, format: "mp4" },
    videoStoragePlan: "free",
    videoExpiresAt: "2026-09-02T00:00:00Z",
    metadata: { subtitleSrt: "LAMA", currentStep: "video" },
    ...patch,
  };
}

describe("clearedMedia", () => {
  test("script → audio+subtitle+video; audio → subtitle+video; subtitle → video", () => {
    expect(clearedMedia("script")).toEqual(["audio", "subtitle", "video"]);
    expect(clearedMedia("audio")).toEqual(["subtitle", "video"]);
    expect(clearedMedia("subtitle")).toEqual(["video"]);
  });

  test("mengembalikan salinan — memutasi hasil tidak merusak DOWNSTREAM_MEDIA", () => {
    const copy = clearedMedia("script");
    copy.push("subtitle");
    expect(clearedMedia("script")).toEqual(["audio", "subtitle", "video"]);
  });
});

describe("invalidateDownstream — script (regenerasi naskah)", () => {
  test("media hilir dihapus, steps pending, status draft, subtitleSrt ikut hilang", () => {
    const base = project();
    const next = invalidateDownstream(base, "script");

    expect(next.audio).toBeUndefined();
    expect(next.subtitle).toBeUndefined();
    expect(next.video).toBeUndefined();
    expect(next.steps.audio).toBe("pending");
    expect(next.steps.subtitle).toBe("pending");
    expect(next.steps.video).toBe("pending");
    expect(next.steps.script).toBe("done"); // hulu tidak di-reset
    expect(next.status).toBe("draft"); // bukan completed
    expect(next.metadata?.subtitleSrt).toBeUndefined();
    expect(next.videoStoragePlan).toBeUndefined();
    expect(next.videoExpiresAt).toBeNull();
    expect(next.currentStep).toBe("script");
    expect(next.script).toEqual(base.script); // script hasil regen tetap ada
  });

  test("argumen project asli TIDAK dimutasi", () => {
    const base = project();
    invalidateDownstream(base, "script");
    expect(base.video).toBeDefined();
    expect(base.steps.video).toBe("done");
    expect(base.status).toBe("completed");
  });

  test("cache posting (caption) ikut di-invalidate saat script diregenerasi", () => {
    const base = project({
      metadata: {
        subtitleSrt: "LAMA",
        currentStep: "video",
        posting: { optimizedTitle: "J", caption: "C", hashtags: ["#a"] },
      },
    });
    const next = invalidateDownstream(base, "script");
    expect(next.metadata?.posting).toBeUndefined();
    // argumen asli tidak dimutasi
    expect(base.metadata?.posting).toBeDefined();
  });

  test("regen audio/subtitle TIDAK menyentuh cache posting (caption berasal dari script)", () => {
    const base = project({
      metadata: {
        subtitleSrt: "LAMA",
        currentStep: "video",
        posting: { optimizedTitle: "J", caption: "C", hashtags: ["#a"] },
      },
    });
    for (const upstream of ["audio", "subtitle"] as const) {
      const next = invalidateDownstream(base, upstream);
      expect(next.metadata?.posting).toBeDefined();
    }
  });
});

describe("invalidateDownstream — audio & subtitle", () => {
  test("audio diregenerasi → subtitle+video direset, audio & script tetap", () => {
    const next = invalidateDownstream(project(), "audio");
    expect(next.audio).toBeDefined();
    expect(next.subtitle).toBeUndefined();
    expect(next.video).toBeUndefined();
    expect(next.steps.script).toBe("done");
    expect(next.steps.subtitle).toBe("pending");
    expect(next.steps.video).toBe("pending");
    expect(next.status).toBe("draft");
    expect(next.currentStep).toBe("audio");
  });

  test("subtitle diregenerasi → hanya video direset; subtitleSrt LAMA dipertahankan", () => {
    const next = invalidateDownstream(project(), "subtitle");
    expect(next.subtitle).toBeDefined();
    expect(next.video).toBeUndefined();
    expect(next.steps.video).toBe("pending");
    expect(next.metadata?.subtitleSrt).toBe("LAMA"); // diganti saat setSubtitleResult
    expect(next.currentStep).toBe("video"); // subtitle bukan destination step
    expect(next.status).toBe("draft");
  });
});

describe("invalidateDownstream — media sudah kosong (idempoten)", () => {
  test("tanpa media apa pun → tidak melempar, hasil tetap kosong", () => {
    const bare = project({ audio: undefined, subtitle: undefined, video: undefined, videoStoragePlan: undefined, videoExpiresAt: undefined });
    for (const upstream of ["script", "audio", "subtitle"] as const) {
      const next = invalidateDownstream(bare, upstream);
      expect(next.audio).toBeUndefined();
      expect(next.video).toBeUndefined();
      expect(next.status).toBe("draft");
    }
  });
});