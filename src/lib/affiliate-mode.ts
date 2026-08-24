/**
 * Affiliate Mode Helper — ACS
 *
 * Membantu membangun prompt affiliate:
 * - Comparison mode: struktur intro → produk A → produk B → (opsional C) → verdict → soft CTA
 * - Inject data trending dari TrendTracker sebagai konteks (bukan hard-sell)
 */

import { Product } from "@/lib/trendtracker-client";

/**
 * Bangun block konteks data produk trending (untuk single mode).
 * Hanya sebagai referensi, bukan hard-sell.
 */
export function buildTrendingContext(products: Product[], limit: number = 3): string {
  if (!products || products.length === 0) {
    return "";
  }

  const topN = products.slice(0, limit);
  const lines = topN.map((p, i) => {
    const price = p.price ? `Harga: ${p.price}` : "";
    const rating = p.rating ? `Rating: ${p.rating}/5` : "";
    const badge = p.platformBadge ? `Platform: ${p.platformBadge}` : "";
    const review = p.reviewCount ? `Review: ${p.reviewCount} ulasan` : "";
    return `${i + 1}. ${p.name}${price ? ` — ${price}` : ""}${rating ? ` (${rating})` : ""}${review ? `, ${review}` : ""}${badge ? `, ${badge}` : ""}`;
  });

  return `
DATA PRODUK TRENDING (dari TrendTracker — sebagai REFERENSI KONTEKS, bukan keharusan menyebut semua):
${lines.join("\n")}

PENTING: Data di atas sebagai konteks pasar. Gunakan secukupnya untuk membuat konten terasa aktual. JANGAN hard-sell.`;
}

/**
 * Bangun prompt segment khusus untuk comparison mode.
 * Struktur: intro → produk A → produk B → (opsional C) → verdict → soft CTA.
 *
 * @returns string — prompt user untuk AI
 */
export function buildComparisonPrompt(
  topic: string,
  comparisonProducts: Array<{
    productName: string;
    productDescription: string;
    productPrice?: string;
    productRating?: number;
  }>,
  outline: string,
  scenesPerSegment: number,
  totalScenes: number,
  durationLabel: string,
  affiliateModeLabel: string,
  trendingContext: string,
  sessionSeed: string
): string {
  const productsBlock = comparisonProducts
    .map((p, i) => `--- PRODUK ${i + 1} ---
Nama: ${p.productName}
Fitur/Deskripsi: ${p.productDescription}
${p.productPrice ? `Harga: Rp ${p.productPrice}` : ""}
${p.productRating ? `Rating: ${p.productRating}/5` : ""}`)
    .join("\n\n");

  return `Buat script video review PERBANDINGAN produk dengan topik: "${topic}"

MODE: COMPARISON (${affiliateModeLabel})

OUTLINE GLOBAL:
${outline}

PRODUK YANG DIBANDINGKAN (${comparisonProducts.length} produk):
${productsBlock}

${trendingContext}

STRUKTUR WAJIB (ikuti urutan ini):
1. INTRO — jelaskan masalah/kebutuhan yang relevan
2. PRODUK A — bahas fitur, kelebihan, kekurangan
3. PRODUK B — bahas fitur, kelebihan, kekurangan
${comparisonProducts.length >= 3 ? "4. PRODUK C — bahas fitur, kelebihan, kekurangan\n" : ""}${comparisonProducts.length >= 3 ? "5. VERDICT — kesimpulan mana yang cocok untuk siapa\n" : "4. VERDICT — kesimpulan mana yang cocok untuk siapa\n"}TERAKHIR — soft CTA (bukan hard-sell)

ATURAN PERBANDINGAN:
- HANYA gunakan data fitur yang tertulis di deskripsi masing-masing produk.
- DILARANG membuat klaim yang tidak ada di input.
- DILARANG hard-sell: "beli sekarang", "jangan sampai ketinggalan", "kehabisan stok".
- Fokus membantu audiens memilih sesuai kebutuhan, bukan memaksa beli.

Target: ${scenesPerSegment} scene (total ${totalScenes} scene).
Durasi: ${durationLabel}.

SESSION SEED (variasi diksi): ${sessionSeed} — gunakan sebagai inspirasi tone, bukan ditulis literal.`;
}