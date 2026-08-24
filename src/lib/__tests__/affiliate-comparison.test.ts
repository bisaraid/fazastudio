import { test, expect, describe } from "vitest";
import { buildComparisonPrompt, buildTrendingContext } from "@/lib/affiliate-mode";
import { validateAffiliateComparison, AffiliateInput } from "@/lib/script-validator";

const products2 = [
  { productName: "HP A", productDescription: "RAM 8GB, layar AMOLED", productPrice: "2.500.000", productRating: 4.5 },
  { productName: "HP B", productDescription: "RAM 8GB, baterai 5000mAh", productPrice: "3.000.000", productRating: 4.8 },
];

const products1 = [
  { productName: "HP A", productDescription: "RAM 8GB", productPrice: "2.500.000" },
];

describe("buildComparisonPrompt", () => {
  test("2 produk → prompt berstruktur benar (intro → A → B → verdict → soft CTA)", () => {
    const sessionSeed = "tenang-senja";
    const prompt = buildComparisonPrompt(
      "HP murah terbaik",
      products2,
      "Outline global",
      8,
      10,
      "Bandingkan (3 menit)",
      "comparison",
      buildTrendingContext([]),
      sessionSeed
    );

    // Struktur harus ada
    expect(prompt).toContain("MODE: COMPARISON");
    expect(prompt).toContain("1. INTRO");
    expect(prompt).toContain("2. PRODUK A");
    expect(prompt).toContain("3. PRODUK B");
    expect(prompt).toContain("4. VERDICT");
    expect(prompt).toContain("TERAKHIR — soft CTA");
    expect(prompt).toContain("HP A");
    expect(prompt).toContain("HP B");

    // Session seed harus masuk
    expect(prompt).toContain(`SESSION SEED (variasi diksi): ${sessionSeed}`);
  });

  test("3 produk → struktur punya PRODUK C", () => {
    const products3 = [...products2, { productName: "HP C", productDescription: "Kamera 108MP" }];
    const prompt = buildComparisonPrompt(
      "HP terbaik",
      products3,
      "outline",
      5,
      10,
      "long",
      "comparison",
      "",
      "berani-ombak"
    );

    expect(prompt).toContain("4. PRODUK C");
    expect(prompt).toContain("5. VERDICT");
  });

  test("hard-sell dilarang di struktur prompt", () => {
    const prompt = buildComparisonPrompt("HP", products2, "outline", 5, 10, "long", "comparison", "", "seed");
    expect(prompt).toContain("DILARANG hard-sell");
  });
});

describe("buildTrendingContext", () => {
  test("kosong → return string kosong", () => {
    expect(buildTrendingContext([])).toBe("");
  });
});

describe("validateAffiliateComparison", () => {
  test("1 produk → validator return error (wajib minimal 2)", () => {
    const affiliateInput: AffiliateInput = {
      productName: "HP A",
      productDescription: "RAM 8GB",
      affiliateMode: "comparison",
      comparisonProducts: products1,
    };

    const result = validateAffiliateComparison(affiliateInput, [{ content: "Review jujur" }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("minimal 2"))).toBe(true);
  });

  test("2 produk tanpa hard-sell → valid", () => {
    const affiliateInput: AffiliateInput = {
      productName: "HP A",
      productDescription: "RAM 8GB",
      affiliateMode: "comparison",
      comparisonProducts: products2,
    };

    const result = validateAffiliateComparison(affiliateInput, [
      { content: "Produk A cocok untuk gaming, produk B cocok untuk harian." },
    ]);
    expect(result.valid).toBe(true);
  });

  test("ada 'beli sekarang' → validator return error (hard-sell)", () => {
    const affiliateInput: AffiliateInput = {
      productName: "HP A",
      productDescription: "RAM 8GB",
      affiliateMode: "comparison",
      comparisonProducts: products2,
    };

    const result = validateAffiliateComparison(affiliateInput, [
      { content: "Jangan sampai ketinggalan, beli sekarang juga!" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("hard-sell"))).toBe(true);
  });
});