import { test, expect, describe, vi, beforeEach } from "vitest";

// ============================================================
// MOCK global fetch
// ============================================================

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { fetchTrendingProducts, clearTrendingCache } from "@/lib/trendtracker-client";

describe("fetchTrendingProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTrendingCache();
  });

  test("API sukses → data terisi", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { id: 1, name: "Produk A", price: "100000", rating: 4.5 },
          { id: 2, name: "Produk B", price: "200000", rating: 5 },
        ],
      }),
    });

    const products = await fetchTrendingProducts("teknologi");
    expect(products.length).toBe(2);
    expect(products[0].name).toBe("Produk A");
  });

  test("API timeout → return [], tidak throw", async () => {
    // Simulasi timeout via AbortError
    mockFetch.mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));

    const products = await fetchTrendingProducts("teknologi");
    expect(products).toEqual([]);
  });

  test("API error → return []", async () => {
    mockFetch.mockRejectedValue(new Error("Network down"));

    const products = await fetchTrendingProducts("teknologi");
    expect(products).toEqual([]);
  });

  test("API response tidak format → return []", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    });

    const products = await fetchTrendingProducts("teknologi");
    expect(products).toEqual([]);
  });

  test("cache hit → tidak fetch ulang", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [{ id: 1, name: "Produk A" }],
      }),
    });

    // Fetch pertama — isi cache
    await fetchTrendingProducts("teknologi");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Fetch kedua — cache hit, tidak fetch ulang
    await fetchTrendingProducts("teknologi");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});