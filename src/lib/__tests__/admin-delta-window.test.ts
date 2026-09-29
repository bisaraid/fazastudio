import { test, expect, describe } from "vitest";
import { deltaWindow, assembleAdminDeltas, type DeltaCounts } from "@/lib/admin-delta";

// ============================================================
// Test batas window + perakitan delta — fungsi MURNI, tanpa jaringan/mock.
// (Harness vitest proyek ini tidak men-support vi.mock untuk modul lokal,
//  jadi bagian I/O dijaga tetap tipis dan logikanya diuji di sini.)
// ============================================================

const NOW = new Date("2026-01-15T00:00:00.000Z");
const MID = "2026-01-08T00:00:00.000Z"; // 7 hari lalu
const PREV_FROM = "2026-01-01T00:00:00.000Z"; // 14 hari lalu
const WIN = { currentFrom: MID, currentTo: NOW.toISOString(), previousFrom: PREV_FROM };

const counts = (
  users: [number, number],
  projects: [number, number],
  scripts: [number, number]
): DeltaCounts => ({
  newUsers: { current: users[0], previous: users[1] },
  newProjects: { current: projects[0], previous: projects[1] },
  newScripts: { current: scripts[0], previous: scripts[1] },
});

describe("deltaWindow", () => {
  test("7 hari terakhir vs 7 hari sebelumnya (inklusif di dua ujung)", () => {
    const w = deltaWindow(NOW.getTime());
    expect(w.currentTo).toBe(NOW.toISOString());
    expect(w.currentFrom).toBe(MID);
    expect(w.previousFrom).toBe(PREV_FROM);
  });

  test("now tidak valid -> pakai waktu sekarang", () => {
    const w = deltaWindow(NaN);
    expect(Number.isNaN(Date.parse(w.currentTo))).toBe(false);
    expect(Date.parse(w.currentTo) - Date.parse(w.currentFrom)).toBe(7 * 86400000);
  });
});

describe("assembleAdminDeltas", () => {
  test("naik 40%, turun 50%, dan 0% dipetakan benar", () => {
    const d = assembleAdminDeltas(counts([6, 6], [14, 10], [5, 10]), WIN, NOW.toISOString());
    expect(d.newUsers).toEqual({ current: 6, previous: 6, pct: 0, direction: "flat" });
    expect(d.newProjects).toEqual({ current: 14, previous: 10, pct: 40, direction: "up" });
    expect(d.newScripts).toEqual({ current: 5, previous: 10, pct: -50, direction: "down" });
    expect(d.window.currentFrom).toBe(MID);
    expect(d.generatedAt).toBe(NOW.toISOString());
  });

  test("baseline kosong -> pct null: 'Baru' kalau ada aktivitas, '—' kalau nol", () => {
    const d = assembleAdminDeltas(counts([0, 0], [3, 0], [0, 0]), WIN, NOW.toISOString());
    expect(d.newProjects.pct).toBeNull();
    expect(d.newProjects.direction).toBe("up"); // UI: "Baru"
    expect(d.newUsers.pct).toBeNull();
    expect(d.newUsers.direction).toBe("flat"); // UI: "—"
    expect(d.newScripts.direction).toBe("flat");
  });

  test("tidak ada NaN/Infinity pada output", () => {
    const d = assembleAdminDeltas(counts([1, 0], [0, 0], [9, 1]), WIN, NOW.toISOString());
    for (const m of [d.newUsers, d.newProjects, d.newScripts]) {
      expect(Number.isFinite(m.current)).toBe(true);
      expect(Number.isFinite(m.previous)).toBe(true);
      expect(m.pct === null || Number.isFinite(m.pct)).toBe(true);
    }
    expect(d.newScripts.pct).toBe(800);
  });
});