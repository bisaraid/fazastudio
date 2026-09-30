import { test, expect, describe } from "vitest";
import {
  isReusableRenderJob,
  pickReusableRenderJob,
  REUSE_WINDOW_MS,
  type CandidateJob,
  type ReuseRequest,
} from "@/lib/pipeline/render-job-reuse";

const NOW = 1_700_000_000_000;

function req(patch: Partial<ReuseRequest> = {}): ReuseRequest {
  return {
    projectId: "p1",
    audioUrl: "acs-audio/audio.mp3",
    subtitleUrl: "acs-subtitle/sub.srt",
    nowMs: NOW,
    ...patch,
  };
}

function job(patch: Partial<CandidateJob> = {}): CandidateJob {
  return {
    id: "render:p1:1",
    timestamp: NOW - 1_000,
    projectId: "p1",
    audioUrl: "acs-audio/audio.mp3",
    subtitleUrl: "acs-subtitle/sub.srt",
    ...patch,
  };
}

describe("isReusableRenderJob", () => {
  test("job masih hidup, project & media sama, segar → boleh dipakai ulang", () => {
    expect(isReusableRenderJob(job(), req())).toBe(true);
  });

  test("project berbeda → tidak dipakai ulang", () => {
    expect(isReusableRenderJob(job({ projectId: "p2" }), req())).toBe(false);
  });

  test("audio berbeda (mis. habis 'Ulangi Audio') → job baru", () => {
    expect(isReusableRenderJob(job({ audioUrl: "acs-audio/lain.mp3" }), req())).toBe(false);
  });

  test("subtitle berbeda → job baru", () => {
    expect(isReusableRenderJob(job({ subtitleUrl: "acs-subtitle/lain.srt" }), req())).toBe(false);
  });

  test("job lebih tua dari jendela reuse 15 menit → job baru", () => {
    expect(isReusableRenderJob(job({ timestamp: NOW - REUSE_WINDOW_MS - 1 }), req())).toBe(false);
  });

  test("tepat di batas jendela → masih boleh dipakai ulang", () => {
    expect(isReusableRenderJob(job({ timestamp: NOW - REUSE_WINDOW_MS }), req())).toBe(true);
  });

  test("job tanpa timestamp (tidak diketahui umurnya) → job baru", () => {
    expect(isReusableRenderJob(job({ timestamp: undefined }), req())).toBe(false);
  });

  test("job tanpa id → tidak dipakai ulang", () => {
    expect(isReusableRenderJob(job({ id: "" }), req())).toBe(false);
  });
});

describe("pickReusableRenderJob", () => {
  test("memilih job pertama yang memenuhi syarat", () => {
    const jobs = [
      job({ id: "render:lain:1", projectId: "p9" }),
      job({ id: "render:p1:2" }),
      job({ id: "render:p1:3" }),
    ];
    expect(pickReusableRenderJob(jobs, req())).toBe("render:p1:2");
  });

  test("tidak ada yang cocok → null", () => {
    const jobs = [job({ id: "render:p1:4", timestamp: NOW - REUSE_WINDOW_MS - 5_000 })];
    expect(pickReusableRenderJob(jobs, req())).toBeNull();
  });

  test("daftar kosong → null", () => {
    expect(pickReusableRenderJob([], req())).toBeNull();
  });
});
