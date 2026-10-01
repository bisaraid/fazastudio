// ============================================================
// Kartu "Siap untuk Posting" — unit test logika show/hide (fungsional murni).
// ============================================================
import { test, expect, describe } from "vitest";
import {
  getPostingCardPhase,
  hasPostingMaterial,
  resolvePostingCache,
} from "@/lib/pipeline/posting-card-state";
import type { PostingMaterial } from "@/lib/pipeline/posting-card-state";

const MATERIAL: PostingMaterial = {
  optimizedTitle: "Judul Viral",
  caption: "Caption keren 🎬",
  hashtags: ["#edukasi", "#belajar"],
};

describe("hasPostingMaterial", () => {
  test("null / undefined → false", () => {
    expect(hasPostingMaterial(null)).toBe(false);
    expect(hasPostingMaterial(undefined)).toBe(false);
  });

  test("objek kosong / semua field kosong → false", () => {
    expect(hasPostingMaterial({})).toBe(false);
    expect(
      hasPostingMaterial({ optimizedTitle: "", caption: "   ", hashtags: [] })
    ).toBe(false);
    expect(hasPostingMaterial({ hashtags: ["", "  "] })).toBe(false);
  });

  test("cukup salah satu field non-kosong → true", () => {
    expect(hasPostingMaterial({ optimizedTitle: "Judul" })).toBe(true);
    expect(hasPostingMaterial({ caption: "Isi caption" })).toBe(true);
    expect(hasPostingMaterial({ hashtags: ["#tag"] })).toBe(true);
    expect(hasPostingMaterial(MATERIAL)).toBe(true);
  });
});

describe("resolvePostingCache", () => {
  test("cache metadata.posting menang di atas fallback script", () => {
    const fromMeta: PostingMaterial = { optimizedTitle: "BARU" };
    const fromScript = { optimizedTitle: "LAMA", caption: "lama", hashtags: ["#lama"] };
    expect(resolvePostingCache(fromMeta, fromScript)).toEqual(fromMeta);
  });

  test("metadata kosong → fallback ke field script lama", () => {
    const fromScript = { optimizedTitle: "LAMA", caption: "lama", hashtags: ["#lama"] };
    expect(resolvePostingCache(undefined, fromScript)).toEqual(fromScript);
    expect(resolvePostingCache({}, fromScript)).toEqual(fromScript);
  });

  test("keduanya kosong → null", () => {
    expect(resolvePostingCache(undefined, undefined)).toBeNull();
    expect(resolvePostingCache({}, { optimizedTitle: "", caption: "", hashtags: [] })).toBeNull();
  });
});

describe("getPostingCardPhase", () => {
  test("pre-video → hidden meski cache sudah ada", () => {
    expect(
      getPostingCardPhase({ videoDone: false, material: MATERIAL, fetchStatus: "idle" })
    ).toBe("hidden");
  });

  test("video selesai + cache ada → content (tanpa peduli status fetch)", () => {
    for (const fetchStatus of ["idle", "loading", "error"] as const) {
      expect(
        getPostingCardPhase({ videoDone: true, material: MATERIAL, fetchStatus })
      ).toBe("content");
    }
  });

  test("video selesai + belum ada cache + fetch idle/loading → loading", () => {
    expect(
      getPostingCardPhase({ videoDone: true, material: null, fetchStatus: "idle" })
    ).toBe("loading");
    expect(
      getPostingCardPhase({ videoDone: true, material: null, fetchStatus: "loading" })
    ).toBe("loading");
  });

  test("video selesai + fetch gagal → failed (retry manual, bukan skeleton)", () => {
    expect(
      getPostingCardPhase({ videoDone: true, material: null, fetchStatus: "error" })
    ).toBe("failed");
  });
});