import { test, expect, describe } from "vitest";
import { buildDeltaMetric } from "@/lib/admin-delta";

describe("buildDeltaMetric", () => {
  test("baseline kosong & tidak ada aktivitas -> null + flat (UI '—')", () => {
    const d = buildDeltaMetric(0, 0);
    expect(d.pct).toBeNull();
    expect(d.direction).toBe("flat");
    expect(d.current).toBe(0);
    expect(d.previous).toBe(0);
  });

  test("baseline kosong tapi ada aktivitas -> null + up (UI 'Baru'), bukan NaN", () => {
    const d = buildDeltaMetric(5, 0);
    expect(d.pct).toBeNull();
    expect(d.direction).toBe("up");
    expect(d.current).toBe(5);
    expect(Number.isNaN(d.pct as unknown as number)).toBe(false);
  });

  test("naik -> pct positif + up", () => {
    const d = buildDeltaMetric(14, 10);
    expect(d.pct).toBe(40);
    expect(d.direction).toBe("up");
  });

  test("turun -> pct negatif + down", () => {
    const d = buildDeltaMetric(5, 10);
    expect(d.pct).toBe(-50);
    expect(d.direction).toBe("down");
  });

  test("sama -> 0% + flat (netral)", () => {
    const d = buildDeltaMetric(7, 7);
    expect(d.pct).toBe(0);
    expect(d.direction).toBe("flat");
  });

  test("nilai tidak valid (NaN/Infinity/negatif) tidak menghasilkan NaN", () => {
    for (const [c, p] of [
      [NaN, 10],
      [10, NaN],
      [Infinity, 5],
      [5, Infinity],
      [-3, -2],
    ] as Array<[number, number]>) {
      const d = buildDeltaMetric(c, p);
      expect(Number.isFinite(d.pct as number) || d.pct === null).toBe(true);
      expect(Number.isFinite(d.current)).toBe(true);
      expect(Number.isFinite(d.previous)).toBe(true);
      expect(d.current).toBeGreaterThanOrEqual(0);
      expect(d.previous).toBeGreaterThanOrEqual(0);
    }
  });

  test("pembulatan persen", () => {
    expect(buildDeltaMetric(10, 3).pct).toBe(233);
    expect(buildDeltaMetric(3, 10).pct).toBe(-70);
  });
});