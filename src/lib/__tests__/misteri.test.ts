import { test, expect, describe } from "vitest";
import { getClosingStrategy, closingStrategies } from "@/lib/categories/misteri";

describe("getClosingStrategy (misteri)", () => {
  test("mengembalikan strategi yang valid dari daftar", () => {
    const strategy = getClosingStrategy("misteri", []);
    expect(closingStrategies.map((s) => s.id)).toContain(strategy.id);
  });

  test("tidak mengulang strategi yang sudah dipakai selama masih ada opsi", () => {
    const usedIds: string[] = [];
    const selectedIds: string[] = [];

    for (let i = 0; i < closingStrategies.length; i++) {
      const strategy = getClosingStrategy("misteri", usedIds);
      selectedIds.push(strategy.id);
      usedIds.push(strategy.id);
    }

    expect(new Set(selectedIds).size).toBe(closingStrategies.length);
  });

  test("fallback ke semua strategi jika semua sudah terpakai", () => {
    const allIds = closingStrategies.map((s) => s.id);
    const strategy = getClosingStrategy("misteri", allIds);
    expect(closingStrategies.map((s) => s.id)).toContain(strategy.id);
  });

  test("mengembalikan strategi yang belum dipakai jika ada", () => {
    const usedIds = [closingStrategies[0].id, closingStrategies[1].id];
    const strategy = getClosingStrategy("misteri", usedIds);
    expect(usedIds).not.toContain(strategy.id);
  });
});