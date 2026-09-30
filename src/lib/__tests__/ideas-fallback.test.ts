import { test, expect, describe } from "vitest";

// Regresi Tahap 2a — jalur ai_fallback /api/ideas:
// tidak boleh bentrok unique index (keyword, niche, tanggal) dan tetap
// berlabel source 'ai_fallback' supaya monitoring mengecualikannya.

import { buildAiFallbackRows } from "@/lib/ideas-fallback";

const NOW = "2026-09-30T10:00:00.000Z";

describe("buildAiFallbackRows", () => {
  test("ide AI dinormalisasi & diberi source ai_fallback + skor 0", () => {
    const rows = buildAiFallbackRows(["  Tips Skincare   Pagi  "], "skincare", NOW, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      keyword: "tips skincare pagi",
      niche_slug: "skincare",
      source: "ai_fallback",
      score: 0,
      fetched_at: NOW,
      first_seen_at: NOW,
    });
  });

  test("dedupe in-batch (varian kapitalisasi/spasi yang sama jadi 1 baris)", () => {
    const rows = buildAiFallbackRows(
      ["Tips Skincare Pagi", "tips  skincare pagi", "TIPS SKINCARE PAGI"],
      "skincare",
      NOW,
      []
    );
    expect(rows).toHaveLength(1);
  });

  test("keyword yang sudah ada hari ini (baris harvest/AI lama) dibuang → anti bentrok unique index", () => {
    const rows = buildAiFallbackRows(
      ["Review HP murah", "Ide konten lain"],
      "gadget",
      NOW,
      ["review hp murah", "Ide  Konten LAIN"] // sudah ternormalisasi semua
    );
    expect(rows.map((r) => r.keyword)).toEqual([]);
  });

  test("ide kosong / hanya spasi dibuang", () => {
    const rows = buildAiFallbackRows(["", "   ", "valid"], "gadget", NOW, []);
    expect(rows.map((r) => r.keyword)).toEqual(["valid"]);
  });
});
