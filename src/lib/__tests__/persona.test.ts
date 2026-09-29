import { test, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  NICHES,
  GAYA_BY_NICHE,
  CERITA_BY_NICHE_GAYA,
  categoryForNiche,
  getCeritaOptions,
} from "@/lib/persona-data";
import { resolvePersona } from "@/lib/persona";

// ============================================================
// CATATAN TINJAUAN (2026-09-29)
//
// File ini dulu memakai `vi.mock("@/lib/supabase/service", …)` untuk menguji
// resolvePersona tanpa jaringan. Mock itu TERNYATA TIDAK AKTIF: harness vitest
// di repo ini tidak menerapkan vi.mock untuk file project (lihat TESTING.md,
// lengkap dengan bukti + cara verifikasi). Akibatnya:
//
//   - createServiceRoleClient() yang asli tetap dipanggil,
//   - gagal karena env Supabase kosong di test,
//   - resolvePersona menangkap error itu dan mengembalikan null,
//   - test "lolos" karena JALUR ERROR, bukan karena "kombinasi tak ada di DB".
//
// Mock yang tidak berfungsi sudah dibuang supaya tidak menyesatkan, dan test
// sekarang menguji kontrak yang benar-benar dieksekusi. Untuk menguji cabang
// exact-match dari DB, modul perlu dibuat bisa disuntik client (dependency
// injection) atau harness vitest perlu diperbaiki — lihat TESTING.md.
// ============================================================

// ============================================================
// Coverage data statis
// ============================================================
test("persona-data: setiap niche punya 3 gaya & setiap gaya punya 3 cara cerita", () => {
  const allNiches = [...NICHES.jualan, ...NICHES.konten];
  expect(allNiches.length).toBe(21);

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

// Total kombinasi = 21 niche × 3 gaya × 3 cerita = 189.
test("persona-data: total kombinasi mencapai 189", () => {
  const allNiches = [...NICHES.jualan, ...NICHES.konten];
  let total = 0;
  for (const n of allNiches) {
    const gayaList = GAYA_BY_NICHE[n.slug] ?? [];
    for (const g of gayaList) {
      total += getCeritaOptions(n.slug, g.key).length;
    }
  }
  expect(total).toBe(189);
});

test("resolvePersona: tanpa env Supabase -> null dan tidak melempar error", async () => {
  // Di lingkungan test, NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
  // tidak di-set (vitest tidak memuat .env), jadi createServiceRoleClient()
  // melempar dan resolvePersona harus menelan error itu (kontrak defensif).
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();

  await expect(
    resolvePersona({
      mode: "konten",
      nicheSlug: "mistis",
      gayaKey: "pendongeng-pelan",
      ceritaKey: "bangun-suasana",
    })
  ).resolves.toBeNull();
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
  expect(sqlKeys.size).toBe(189);

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

  expect(combos.length).toBe(189);
  for (const combo of combos) {
    expect(sqlKeys, `kombinasi tidak ada di SQL: ${combo}`).toContain(combo);
  }
});
