import { test, expect, describe } from "vitest";
import {
  decideWatchdog,
  stallTimeoutMs,
  STALL_WHILE_QUEUED_MS,
  STALL_DURING_RENDER_MS,
  STALL_WHILE_UPLOADING_MS,
  type WatchdogInput,
} from "@/lib/pipeline/video-watchdog";

function input(patch: Partial<WatchdogInput> = {}): WatchdogInput {
  return { lastPercent: null, recoveryUsed: false, idleMs: 0, ...patch };
}

describe("stallTimeoutMs", () => {
  test("belum ada percent (antre/persiapan) → toleransi panjang", () => {
    expect(stallTimeoutMs(null)).toBe(STALL_WHILE_QUEUED_MS);
    expect(STALL_WHILE_QUEUED_MS).toBeGreaterThan(STALL_DURING_RENDER_MS);
  });

  test("percent mengalir (FFmpeg jalan) → toleransi pendek", () => {
    expect(stallTimeoutMs(0)).toBe(STALL_DURING_RENDER_MS);
    expect(stallTimeoutMs(99)).toBe(STALL_DURING_RENDER_MS);
  });

  test("percent 100 (menunggu upload) → toleransi panjang lagi", () => {
    expect(stallTimeoutMs(100)).toBe(STALL_WHILE_UPLOADING_MS);
    expect(STALL_WHILE_UPLOADING_MS).toBeGreaterThan(STALL_DURING_RENDER_MS);
  });
});

describe("decideWatchdog", () => {
  test("diam di bawah ambang antre → wait", () => {
    expect(decideWatchdog(input({ idleMs: STALL_WHILE_QUEUED_MS - 1 }))).toBe("wait");
  });

  test("diam tepat di ambang antre → recover (bukan reject)", () => {
    expect(decideWatchdog(input({ idleMs: STALL_WHILE_QUEUED_MS }))).toBe("recover");
  });

  test("masih persiapan tanpa percent → tidak ditolak di bawah ambang", () => {
    // Unduh asset Pexels / siapkan subtitle bisa senyap >30 dtk tapi <120 dtk.
    expect(decideWatchdog(input({ idleMs: 100_000 }))).toBe("wait");
  });

  test("diam di bawah ambang render → wait", () => {
    expect(decideWatchdog(input({ lastPercent: 45, idleMs: STALL_DURING_RENDER_MS - 1 }))).toBe(
      "wait"
    );
  });

  test("diam tepat di ambang render → recover sekali", () => {
    expect(decideWatchdog(input({ lastPercent: 45, idleMs: STALL_DURING_RENDER_MS }))).toBe(
      "recover"
    );
  });

  test("fase upload (percent 100) diam lama → wait, bukan reject prematur", () => {
    expect(decideWatchdog(input({ lastPercent: 100, idleMs: 100_000 }))).toBe("wait");
  });

  test("setelah pemulihan dipakai, diam lagi → reject", () => {
    expect(
      decideWatchdog(
        input({ lastPercent: 45, recoveryUsed: true, idleMs: STALL_DURING_RENDER_MS })
      )
    ).toBe("reject");
  });

  test("antre + pemulihan terpakai + diam panjang → reject", () => {
    expect(
      decideWatchdog(input({ recoveryUsed: true, idleMs: STALL_WHILE_QUEUED_MS + 1_000 }))
    ).toBe("reject");
  });

  test("pemulihan tidak pernah dipakai dua kali", () => {
    const first = decideWatchdog(input({ lastPercent: 45, idleMs: STALL_DURING_RENDER_MS }));
    const second = decideWatchdog(
      input({
        lastPercent: 45,
        idleMs: STALL_DURING_RENDER_MS,
        recoveryUsed: first === "recover",
      })
    );
    expect(first).toBe("recover");
    expect(second).toBe("reject");
  });
});
