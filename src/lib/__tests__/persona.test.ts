import { test, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  NICHES,
  GAYA_BY_NICHE,
  CERITA_BY_NICHE_GAYA,
  categoryForNiche,
  getCeritaOptions,
} from "@/lib/persona-data";

// ============================================================
// Mock createServiceRoleClient — semua query mengembalikan null.
// Guna menguji perilaku exact-match tanpa akses jaringan.
// ============================================================

const { mockClientBuilders } = vi.hoisted(() => {
  function makeFilterable() {
    const q = {
      eq() {
        return this;
      },
      is() {
        return this;
      },
      maybeSingle: async () => ({ data: null, error: null }),
      select() {
        return this;
      },
    };
    return q as any;
  }
  return {
    mockClientBuilders: {
      from: () => makeFilterable(),
    },
  };
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => mockClientBuilders,
}));

import { resolvePersona } from "@/lib/persona";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Coverage data statis
// ============================================================
test("persona-data: setiap niche punya 3 gaya & setiap gaya punya 3 cara cerita", () => {
  const allNiches = [...NICHES.jualan, ...NICHES.konten];
  expect(allNiches.length).toBe(12);

  for (const n of allNiches) {
    const gayaList = GAYA_BY_NICHE[n.slug];
    expect(gayaList, `niche ${n.slug} harus punya 3 gaya`).toHaveLength(3);

    for (const g of gayaList) {
      const ceritaList = CERITA_BY_NICHE_GAYA[n.slug]?.[g.key];
      expect(ceritaList, `gaya ${g.key} (niche ${n.slug}) harus punya cara cerita`).toBeDefined();
      // Setiap kombinasi (niche,gaya) punya tepat 3 opsi cerita.
      expect(getCeritaOptions(n.slug, g.key)).toHaveLength(3);
    }
  }

  for (const n of allNiches) {
    expect(categoryForNiche(n.slug)).toBeTruthy();
  }
});

// Total kombinasi = 12 niche × 3 gaya × 3 cerita = 108.
test("persona-data: total kombinasi mencapai 108", () => {
  const allNiches = [...NICHES.jualan, ...NICHES.konten];
  let total = 0;
  for (const n of allNiches) {
    const gayaList = GAYA_BY_NICHE[n.slug] ?? [];
    for (const g of gayaList) {
      total += getCeritaOptions(n.slug, g.key).length;
    }
  }
  expect(total).toBe(108);
});

test("resolvePersona: mengembalikan null ketika kombinasi tak ada di DB", async () => {
  const res = await resolvePersona({
    mode: "konten",
    nicheSlug: "mistis",
    gayaKey: "pendongeng-pelan",
    ceritaKey: "bangun-suasana",
  });
  // Karena DB mock kosong (null) → exact tidak ketemu → return null.
  expect(res).toBeNull();
});

const SQL_PATH = path.join(process.cwd(), "supabase/migrations/010_seed_personas.sql");

// Pastikan setiap kombinasi (mode, niche, gaya, cerita) yang bisa dipilih user
// di wizard TERSEDIA di seed SQL. Ini mencegah kombinasi "terpilih tapi tidak ada
// prompt" yang mengakibatkan persona tidak ter-inject.
test("seed SQL: setiap kombinasi persona-data hadir di 010_seed_personas.sql", () => {
  const sql = fs.readFileSync(SQL_PATH, "utf8");
  const sqlKeys = new Set<string>();
  for (const line of sql.split("\n")) {
    const m = line.trim().match(/^\('(.+?)','(.+?)','(.+?)','(.+?)',$/);
    if (m) sqlKeys.add(`${m[1]}|${m[2]}|${m[3]}|${m[4]}`);
  }
  expect(sqlKeys.size).toBe(108);

  // Build semua kombinasi yang user bisa pilih.
  const combos: string[] = [];
  const allNiches = [...NICHES.jualan, ...NICHES.konten];
  for (const n of allNiches) {
    const mode = NICHES.jualan.some((x) => x.slug === n.slug) ? "jualan" : "konten";
    const gayaList = GAYA_BY_NICHE[n.slug] ?? [];
    for (const g of gayaList) {
      const ceritaOpts = CERITA_BY_NICHE_GAYA[n.slug]?.[g.key] ?? [];
      for (const c of ceritaOpts) {
        combos.push(`${mode}|${n.slug}|${g.key}|${c.key}`);
      }
    }
  }

  expect(combos.length).toBe(108);
  for (const combo of combos) {
    expect(sqlKeys, `kombinasi tidak ada di SQL: ${combo}`).toContain(combo);
  }
});