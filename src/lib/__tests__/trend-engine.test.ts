import { test, expect, describe } from "vitest";
import {
  computeVelocity,
  isKeywordAlreadyPresent,
  VELOCITY_DIRECTION_THRESHOLD,
} from "@/lib/trend-scoring";

describe("computeVelocity", () => {
  test("tanpa baseline → null (belum cukup data)", () => {
    expect(computeVelocity(50, null)).toBeNull();
    expect(computeVelocity(50, undefined)).toBeNull();
  });

  test("naik melampaui ambang → up", () => {
    const r = computeVelocity(70, 40);
    expect(r).not.toBeNull();
    expect(r!.velocity).toBe(30);
    expect(r!.direction).toBe("up");
  });

  test("tepat di ambang atas → up", () => {
    const r = computeVelocity(60 + VELOCITY_DIRECTION_THRESHOLD, 60);
    expect(r!.direction).toBe("up");
  });

  test("turun melampaui ambang → down", () => {
    const r = computeVelocity(20, 80);
    expect(r!.velocity).toBe(-60);
    expect(r!.direction).toBe("down");
  });

  test("selisih kecil (± di bawah ambang) → stable", () => {
    expect(computeVelocity(60, 62)!.direction).toBe("stable");   // Δ=-2
    expect(computeVelocity(60, 57)!.direction).toBe("stable");   // Δ=3
    expect(computeVelocity(60, 60)!.direction).toBe("stable");   // Δ=0
    // Δ=4.9 (di bawah ambang) tetap stable; Δ tepat 5 → up (lihat test ambang).
    expect(computeVelocity(60, 55.5)!.direction).toBe("stable"); // Δ=4.5
  });

  test("pembulatan 1 desimal", () => {
    const r = computeVelocity(50.75, 10.125);
    expect(r!.velocity).toBe(40.6);
  });
});

describe("isKeywordAlreadyPresent", () => {
  test("keyword kosong → dianggap sudah ada (jangan diusulkan)", () => {
    expect(isKeywordAlreadyPresent(["review"], "")).toBe(true);
  });

  test("substring dua arah → dianggap sudah muncul", () => {
    expect(isKeywordAlreadyPresent(["review serum"], "review serum vitamin C")).toBe(true);
    expect(isKeywordAlreadyPresent(["review serum vitamin C"], "review serum")).toBe(true);
  });

  test("tidak ada kecocokan → belum muncul (bukan sudah ada)", () => {
    expect(isKeywordAlreadyPresent(["outfit harian"], "review serum vitamin C")).toBe(false);
  });

  test("casing tidak peka", () => {
    expect(isKeywordAlreadyPresent(["REVIEW SERUM"], "review serum vitamin C")).toBe(true);
  });
});