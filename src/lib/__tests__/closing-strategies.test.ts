import { test, expect, describe } from "vitest";
import { getClosingStrategy, closingStrategiesByCategory } from "@/lib/categories/closing-strategies";
import { generateSeed } from "@/lib/seed";

describe("Closing Strategies — semua kategori", () => {
  // Semua 10 kategori harus punya 5 strategi
  const expectedCategories = [
    "misteri", "horor", "psikologi", "romance", "motivasi",
    "edukasi", "affiliate", "sejarah", "keuangan", "custom",
  ];

  test("semua kategori punya 5 strategi unik", () => {
    for (const cat of expectedCategories) {
      const strategies = closingStrategiesByCategory[cat];
      expect(strategies, `kategori ${cat}`).toBeDefined();
      expect(strategies.length).toBe(5);
      // id harus unik dalam satu kategori
      const ids = strategies.map((s) => s.id);
      expect(new Set(ids).size).toBe(5);
    }
  });

  test("tiap strategi punya promptHint yang spesifik (bukan generic)", () => {
    for (const cat of expectedCategories) {
      for (const s of closingStrategiesByCategory[cat]) {
        expect(s.promptHint.length).toBeGreaterThan(30);
        expect(s.promptHint).not.toContain("pertanyaan terbuka yang mendorong diskusi");
      }
    }
  });
});

describe("Spot-check kategori baru", () => {
  test("horor", () => {
    const used: string[] = [];
    const selected: string[] = [];
    for (let i = 0; i < 5; i++) {
      const s = getClosingStrategy("horor", used);
      selected.push(s.id);
      used.push(s.id);
    }
    expect(new Set(selected).size).toBe(5);
  });

  test("affiliate", () => {
    const used: string[] = [];
    const selected: string[] = [];
    for (let i = 0; i < 5; i++) {
      const s = getClosingStrategy("affiliate", used);
      selected.push(s.id);
      used.push(s.id);
    }
    expect(new Set(selected).size).toBe(5);
  });

  test("keuangan", () => {
    const used: string[] = [];
    const selected: string[] = [];
    for (let i = 0; i < 5; i++) {
      const s = getClosingStrategy("keuangan", used);
      selected.push(s.id);
      used.push(s.id);
    }
    expect(new Set(selected).size).toBe(5);
  });
});

describe("Anti-repeat reset", () => {
  test("reset bekerja setelah semua 5 terpakai", () => {
    const allIds = closingStrategiesByCategory["horor"].map((s) => s.id);
    // Setelah semua terpakai, getClosingStrategy tetap mengembalikan strategi valid
    const strategy = getClosingStrategy("horor", allIds);
    expect(allIds).toContain(strategy.id);
  });
});

describe("generateSeed()", () => {
  test("tidak return string identik 10x berturut", () => {
    const seeds = new Set<string>();
    for (let i = 0; i < 10; i++) {
      seeds.add(generateSeed());
    }
    // Dengan 20×20 = 400 kombinasi, kemungkinan 10 identik sangat kecil
    expect(seeds.size).toBeGreaterThan(1);
  });

  test("format adalah adjective-noun (mengandung '-')", () => {
    const seed = generateSeed();
    expect(seed).toContain("-");
  });
});