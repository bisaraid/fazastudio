/**
 * Test Tahap A — query builder footage stok (`buildStockQuery`).
 *
 * Fokus:
 * 1. Contoh NYATA dari data kategori (`src/lib/categories/index.ts`) + styleSuffix
 *    genre dan prompt default disclaimer (`src/lib/script-generator.ts:852`):
 *    query baru harus membuang kata gaya/format + suffix, tetap 3-7 kata.
 * 2. Dua SALINAN modul (src/lib vs worker/src) harus identik byte-per-byte dan
 *    menghasilkan keluaran sama — mencegah keduanya "melenceng" saat diubah.
 * 3. Pemilihan klip: pool 5 teratas, durasi minimum, dedupe `usedIds`, seed.
 * 4. Pemakaian di app: `resolveSearchQuery` + urutan `orderFootageForUse`.
 */
import { test, expect } from "vitest";
import fs from "fs";
import path from "path";

import { getCategoryConfig, type CategoryId } from "@/lib/categories";
import { resolveSearchQuery, orderFootageForUse } from "@/lib/footage";
import type { FootageOption } from "@/lib/types";
import {
  buildStockQuery,
  buildStockQueryVariants,
  pickClipCandidate,
  MIN_CLIP_DURATION_S,
  STOCK_QUERY_MAX_WORDS,
  STOCK_QUERY_MIN_WORDS,
} from "@/lib/stock-query";
import * as workerStockQuery from "../../../worker/src/stock-query";

/** prompt = image_prompt + styleSuffix genre (persis yang dipakai script-generator). */
function finalPrompt(categoryId: CategoryId, index = 0): string {
  const cfg = getCategoryConfig(categoryId);
  const scene = cfg.exampleScenes?.[index];
  if (!scene?.image_prompt) throw new Error(`contoh scene tidak ada: ${categoryId}[${index}]`);
  return `${scene.image_prompt}${cfg.styleSuffix ?? ""}`;
}

/** Default disclaimer yang disuntik script-generator (tanpa suffix genre). */
const DISCLAIMER_PROMPT =
  "Disclaimer text overlay on calm gradient background, professional and clean design, neutral colors, informative style";

/** 6 contoh nyata: horor, sejarah, disclaimer, + 3 genre lain. */
const CASES: Array<{ label: string; prompt: string; expected: string }> = [
  { label: "horor", prompt: finalPrompt("horror", 0), expected: "bedroom night light door dust particles floating" },
  { label: "sejarah", prompt: finalPrompt("sejarah", 0), expected: "vintage map indonesian archipelago divided two colonial" },
  { label: "disclaimer", prompt: DISCLAIMER_PROMPT, expected: "disclaimer text overlay gradient background" },
  { label: "psikologi", prompt: finalPrompt("psikologi", 0), expected: "person standing stage spotlight nervous expression audience" },
  { label: "romance", prompt: finalPrompt("romance", 0), expected: "rainy cafe window two people sitting warm" },
  { label: "keuangan", prompt: finalPrompt("keuangan", 1), expected: "small coins growing larger stacks plant sprout" },
];

test("buildStockQuery: 6 contoh nyata menghasilkan query pendek tanpa kata gaya", () => {
  for (const c of CASES) {
    expect(buildStockQuery(c.prompt), c.label).toBe(c.expected);
    const words = c.expected.split(" ");
    expect(words.length, `${c.label}: jumlah kata 3-7`).toBeGreaterThanOrEqual(STOCK_QUERY_MIN_WORDS);
    expect(words.length, `${c.label}: jumlah kata 3-7`).toBeLessThanOrEqual(STOCK_QUERY_MAX_WORDS);
  }
});

test("buildStockQuery: 3 contoh tambahan (scene kedua tiap genre nyata)", () => {
  expect(buildStockQuery(finalPrompt("horror", 1))).toBe("abandoned school hallway cold fog single flashlight");
  expect(buildStockQuery(finalPrompt("misteri", 0))).toBe("archaeological site dawn researchers examining artifacts");
  expect(buildStockQuery(finalPrompt("sejarah", 1))).toBe("vintage photograph strong javanese woman traditional batik");
});

test("buildStockQuery: kata gaya/format + teks [..] dan + dibuang", () => {
  const q = buildStockQuery(
    "[HOOK] dark bedroom at night drone timelapse, cinematic sepia tones, muted colors, vertical slow motion, realistic illustration style, sunrise over rice terrace"
  );
  // Subjek/tempat nyata tetap ada; kata gaya/format dan "[HOOK]" hilang.
  expect(q).toBe("bedroom night sunrise rice terrace");
  for (const banned of ["hook", "dark", "drone", "timelapse", "cinematic", "sepia", "muted", "colors", "vertical", "slow", "motion", "realistic", "illustration", "style", "over"]) {
    expect(q.split(" "), `"${banned}" harus dibuang`).not.toContain(banned);
  }
});

test("buildStockQuery: input kosong / hanya kata gaya → string kosong (caller pakai fallback)", () => {
  expect(buildStockQuery("")).toBe("");
  expect(buildStockQuery(undefined)).toBe("");
  expect(buildStockQuery("clean modern illustration style, cinematic muted colors")).toBe("");
  // custom dengan niche kosong: seluruh prompt placeholdernya bergaya → kosong.
  expect(buildStockQuery(finalPrompt("custom", 0))).toBe("");
});

// ============================================================
// Query cadangan (variasi lebih pendek)
// ============================================================

test("buildStockQueryVariants: query utama + 2 variasi lebih pendek (diuji berurutan)", () => {
  const variants = buildStockQueryVariants(CASES[0].prompt);
  expect(variants).toEqual([
    "bedroom night light door dust particles floating",
    "bedroom night light door dust",
    "bedroom night light",
  ]);
  // Variasi selalu prefix dari query utama (makin pendek, makin umum).
  for (const v of variants) expect(variants[0].startsWith(v)).toBe(true);
  // Prompt kosong/tanpa kata kunci → tidak ada variasi.
  expect(buildStockQueryVariants("")).toEqual([]);
  expect(buildStockQueryVariants("clean modern illustration style")).toEqual([]);
});

// ============================================================
// Pemilihan klip (pool 5 teratas, durasi minimum, dedupe, seed)
// ============================================================

const clip = (id: string, duration: number) => ({ id, duration });

test("pickClipCandidate: pool 5 teratas + durasi minimum + dedupe + seed deterministik", () => {
  const candidates = [clip("a", 12), clip("b", 9), clip("c", 2), clip("d", 7), clip("e", 5), clip("f", 30), clip("g", 40)];

  // pool = 5 teratas (a..e); "c" (2 dtk < MIN_CLIP_DURATION_S) dibuang.
  expect(pickClipCandidate(candidates, new Set(), { seed: 0 })?.id).toBe("a");
  expect(pickClipCandidate(candidates, new Set(), { seed: 1 })?.id).toBe("b");
  expect(pickClipCandidate(candidates, new Set(), { seed: 2 })?.id).toBe("d");
  expect(pickClipCandidate(candidates, new Set(), { seed: 3 })?.id).toBe("e");

  // Kandidat di luar pool 5 TIDAK pernah dipilih walau durasinya panjang.
  for (let seed = 0; seed < 12; seed++) {
    expect(["a", "b", "d", "e"]).toContain(pickClipCandidate(candidates, new Set(), { seed })?.id);
  }

  // Dedupe: kandidat yang sudah dipakai dibuang LEBIH DULU, lalu pool 5 teratas
  // diambil dari sisa (jadi pool tetap berisi kandidat yang bisa dipakai).
  expect(pickClipCandidate(candidates, new Set(["a", "b", "d", "e"]), { seed: 0 })?.id).toBe("f");
  // Kalau yang tersisa hanya klip pendek, klip pendek dipakai (lebih baik
  // daripada tidak ada klip sama sekali).
  expect(pickClipCandidate([clip("c", 2)], new Set(), { seed: 0 })?.id).toBe("c");
  expect(pickClipCandidate(candidates, new Set(candidates.map((c) => c.id)))).toBeNull();
  expect(pickClipCandidate([], new Set())).toBeNull();

  // Semua klip pendek → tetap ada pilihan (tidak mengubah jumlah kandidat).
  expect(pickClipCandidate([clip("x", 1), clip("y", 3)], new Set(), { seed: 1 })?.id).toBe("y");

  // poolSize bisa dinaikkan bila caller ingin pool lebih luas.
  expect(pickClipCandidate(candidates, new Set(), { poolSize: 7, seed: 5 })?.id).toBe("g");

  // Durasi minimum bisa diubah caller.
  expect(pickClipCandidate(candidates, new Set(), { minDurationSeconds: 10, seed: 0 })?.id).toBe("a");
  expect(pickClipCandidate(candidates, new Set(), { minDurationSeconds: 10, seed: 1 })?.id).toBe("a");
});

function footageOption(id: string, duration: number): FootageOption {
  return { id, videoUrl: "https://video.example/" + id + ".mp4", thumbnail: "", duration, query: "q", source: "pexels" };
}

test("orderFootageForUse: klip cukup panjang didahulukan, urutan lain stabil", () => {
  const list = [footageOption("short1", 2), footageOption("long1", 10), footageOption("short2", 0), footageOption("long2", MIN_CLIP_DURATION_S)];
  expect(orderFootageForUse(list).map((o) => o.id)).toEqual(["long1", "long2", "short1", "short2"]);
  expect(orderFootageForUse([]).length).toBe(0);
});

// ============================================================
// Integrasi app: resolveSearchQuery memakai fungsi yang SAMA
// ============================================================

test("resolveSearchQuery: buildStockQuery + fallback genre apa adanya", () => {
  expect(resolveSearchQuery("dark bedroom at night, muted colors, cinematic lighting", "horor")).toBe("bedroom night");
  // Prompt kosong / hanya kata gaya → fallback genre (string-nya tidak diubah).
  expect(resolveSearchQuery("", "horor")).toBe("dark horror creepy");
  expect(resolveSearchQuery("clean modern illustration style", "sejarah")).toBe("ancient history ruins");
  // Id yang bukan kunci GENRE_FALLBACK_QUERY (mis. CategoryId "horror") → generik.
  expect(resolveSearchQuery("", "horror")).toBe("cinematic abstract");
  expect(resolveSearchQuery(undefined, "genre-tidak-ada")).toBe("cinematic abstract");
  expect(resolveSearchQuery(undefined, undefined)).toBe("cinematic abstract");
});

test("resolveSearchQuery memakai keluaran yang identik dengan salinan worker", () => {
  for (const c of CASES) {
    expect(resolveSearchQuery(c.prompt, "horror"), c.label).toBe(workerStockQuery.buildStockQuery(c.prompt));
  }
});

// ============================================================
// Dua salinan (app vs worker) tidak boleh melenceng
// ============================================================

const APP_COPY = path.join(process.cwd(), "src/lib/stock-query.ts");
const WORKER_COPY = path.join(process.cwd(), "worker/src/stock-query.ts");

function allExamplePrompts(): string[] {
  const ids: CategoryId[] = ["horror", "misteri", "psikologi", "romance", "motivasi", "edukasi", "affiliate", "sejarah", "keuangan"];
  const prompts: string[] = [];
  for (const id of ids) {
    const cfg = getCategoryConfig(id);
    for (const scene of cfg.exampleScenes ?? []) {
      if (scene.image_prompt) prompts.push(`${scene.image_prompt}${cfg.styleSuffix ?? ""}`);
    }
  }
  prompts.push(DISCLAIMER_PROMPT);
  return prompts;
}

test("salinan worker IDENTIK byte-per-byte dengan salinan app + memuat peringatan", () => {
  const app = fs.readFileSync(APP_COPY);
  const worker = fs.readFileSync(WORKER_COPY);
  expect(worker.equals(app), "worker/src/stock-query.ts harus byte-identik dengan src/lib/stock-query.ts").toBe(true);
  expect(app.toString("utf8")).toContain("SALINAN KEMBAR");
  expect(app.toString("utf8")).toContain("worker/src/stock-query.ts");
});

test("dua salinan menghasilkan keluaran sama pada seluruh contoh", () => {
  const prompts = [...allExamplePrompts(), "", "clean modern illustration style", "[x] + dark drone bedroom at night", "sunset over the rice field"];
  for (const prompt of prompts) {
    expect(workerStockQuery.buildStockQuery(prompt), prompt).toBe(buildStockQuery(prompt));
    expect(workerStockQuery.buildStockQueryVariants(prompt), prompt).toEqual(buildStockQueryVariants(prompt));
  }
  const candidates = [clip("1", 2), clip("2", 9), clip("3", 12), clip("4", 5)];
  for (let seed = 0; seed < 5; seed++) {
    expect(workerStockQuery.pickClipCandidate(candidates, new Set(), { seed })).toEqual(pickClipCandidate(candidates, new Set(), { seed }));
  }
  expect(workerStockQuery.MIN_CLIP_DURATION_S).toBe(MIN_CLIP_DURATION_S);
});


