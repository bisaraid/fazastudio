import { test, expect, describe } from "vitest";
import {
  buildMetricsPoints,
  formatDayLabel,
  labelIndices,
  linePath,
  nearestIndex,
  niceMax,
  splitEstimatedSegments,
  ticksFor,
} from "@/lib/admin-chart";

const row = (date: string, users: number, projects: number, isEstimated = false) => ({
  date,
  totalUsers: users,
  totalProjects: projects,
  isEstimated,
});

describe("buildMetricsPoints", () => {
  test("mengurutkan naik per tanggal", () => {
    const out = buildMetricsPoints([row("2026-01-03", 3, 1), row("2026-01-01", 1, 0)]);
    expect(out.map((r) => r.date)).toEqual(["2026-01-01", "2026-01-03"]);
  });

  test("null/undefined -> array kosong (tanpa throw)", () => {
    expect(buildMetricsPoints(null)).toEqual([]);
    expect(buildMetricsPoints(undefined)).toEqual([]);
  });

  test("baris tanpa tanggal valid dibuang", () => {
    const dirty = [row("", 1, 1), row("2026-01-01", 1, 1)] as ReturnType<typeof row>[];
    expect(buildMetricsPoints(dirty)).toHaveLength(1);
  });
});

describe("niceMax", () => {
  test("membulatkan ke angka enak dibaca", () => {
    expect(niceMax(37)).toBe(40);
    expect(niceMax(123)).toBe(150);
    expect(niceMax(8)).toBe(8);
    expect(niceMax(1000)).toBe(1000);
  });

  test("0/negatif/NaN -> 1 (skala tidak pernah nol)", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-5)).toBe(1);
    expect(niceMax(NaN)).toBe(1);
  });
});

describe("ticksFor", () => {
  test("menghasilkan nilai dari 0 sampai max", () => {
    expect(ticksFor(40, 4)).toEqual([0, 10, 20, 30, 40]);
  });

  test("max kecil/tidak valid tidak menghasilkan label duplikat", () => {
    expect(ticksFor(0, 2)).toEqual([0, 1]);
    expect(ticksFor(1, 4)).toEqual([0, 1]);
  });
});

describe("linePath", () => {
  test("kosong -> string kosong", () => {
    expect(linePath([])).toBe("");
  });

  test("titik pertama M, sisanya L", () => {
    expect(linePath([{ x: 0, y: 10 }, { x: 5.56, y: 2.04 }])).toBe("M0.0 10.0 L5.6 2.0");
  });
});

describe("nearestIndex", () => {
  test("memilih titik terdekat", () => {
    const xs = [0, 10, 20, 30];
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 12)).toBe(1);
    expect(nearestIndex(xs, 19)).toBe(2);
    expect(nearestIndex(xs, 999)).toBe(3);
  });

  test("array kosong -> -1", () => {
    expect(nearestIndex([], 5)).toBe(-1);
  });
});

describe("splitEstimatedSegments", () => {
  const p = (isEstimated: boolean) => ({ isEstimated });

  test("semua asli -> satu segmen solid", () => {
    const { solid, estimated } = splitEstimatedSegments([p(false), p(false), p(false)]);
    expect(solid).toHaveLength(1);
    expect(solid[0]).toHaveLength(3);
    expect(estimated).toHaveLength(0);
  });

  test("pergantian data: titik batas dipakai di kedua sisi supaya garis nyambung", () => {
    const flags = [p(true), p(true), p(false), p(false)];
    const { solid, estimated } = splitEstimatedSegments(flags);
    // Segmen perkiraan berisi 2 titik perkiraan + titik batas (indeks 2).
    expect(estimated.flat()).toEqual([flags[0], flags[1], flags[2]]);
    // Sisi solid juga memuat titik batas → tidak ada lompatan garis.
    expect(solid.some((seg) => seg.includes(flags[2]))).toBe(true);
    expect(solid.flat()).toContain(flags[3]);
  });

  test("kosong -> dua array kosong", () => {
    const { solid, estimated } = splitEstimatedSegments([]);
    expect(solid).toEqual([]);
    expect(estimated).toEqual([]);
  });
});

describe("labelIndices", () => {
  test("sedikit titik -> semua dilabeli", () => {
    expect(labelIndices(3, 4)).toEqual([0, 1, 2]);
  });

  test("banyak titik -> maksimal 4 label, tersebar termasuk ujung", () => {
    const idx = labelIndices(30, 4);
    expect(idx.length).toBeLessThanOrEqual(4);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(29);
  });

  test("nol titik -> kosong", () => {
    expect(labelIndices(0)).toEqual([]);
  });
});

describe("formatDayLabel", () => {
  test("format singkat Indonesia", () => {
    expect(formatDayLabel("2026-01-12")).toMatch(/12/);
  });

  test("string tidak valid dikembalikan apa adanya", () => {
    expect(formatDayLabel("bukan-tanggal")).toBe("bukan-tanggal");
  });
});