/**
 * TrendTracker Client — ACS
 *
 * Ambil data produk trending real-time dari TrendTracker API untuk
 * digunakan sebagai konteks di prompt Affiliate.
 *
 * - Timeout 5 detik — jika gagal return [] tanpa throw.
 * - Cache hasil di memory (Map) TTL 1 jam per categoryId.
 * - Server-side only — TIDAK expose API key ke client.
 */

export interface Product {
  id: string | number;
  name: string;
  price?: string;
  rating?: number;
  reviewCount?: number;
  affiliateUrl?: string;
  platformBadge?: string;
}

interface TrendingApiResponse {
  success: boolean;
  data: Product[];
  error?: string;
}

const TRENDTRACKER_API_URL =
  process.env.TRENDTRACKER_API_URL || "https://trendtrackerid.vercel.app";
const FETCH_TIMEOUT_MS = 5000; // 5 detik

// ============================================================
// CACHE IN-MEMORY (TTL 1 jam per categoryId)
// ============================================================

const cache = new Map<string, { products: Product[]; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam

function getCacheKey(categoryId?: string): string {
  return categoryId || "__all__";
}

function getFromCache(key: string): Product[] | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return cached.products;
}

function setCache(key: string, products: Product[]): void {
  cache.set(key, { products, timestamp: Date.now() });
  // Bersihkan cache jika terlalu besar (>50 entries)
  if (cache.size > 50) {
    const oldest = Array.from(cache.entries()).sort(
      ([, a], [, b]) => a.timestamp - b.timestamp
    )[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

/**
 * Bersihkan semua cache (untuk testing).
 */
export function clearTrendingCache(): void {
  cache.clear();
}

// ============================================================
// FETCH DENGAN TIMEOUT
// ============================================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// MAIN FUNCTION
// ============================================================

/**
 * Ambil daftar produk trending dari TrendTracker.
 * Fallback: return [] kalau API down/timeout/error (tidak throw).
 * Cache in-memory TTL 1 jam per categoryId.
 *
 * @param categoryId - Kategori produk (opsional). Jika kosong, ambil semua.
 * @returns Product[] — kosong jika gagal
 */
export async function fetchTrendingProducts(
  categoryId?: string
): Promise<Product[]> {
  const cacheKey = getCacheKey(categoryId);

  // Cache hit — tidak fetch ulang
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log(`[TrendTracker] Cache hit for "${cacheKey}" (${cached.length} products)`);
    return cached;
  }

  const baseUrl = TRENDTRACKER_API_URL;
  const url = categoryId
    ? `${baseUrl}/api/products/trending?category=${encodeURIComponent(categoryId)}`
    : `${baseUrl}/api/products/trending`;

  try {
    console.log(`[TrendTracker] Fetching trending products from ${url}`);
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      console.warn(`[TrendTracker] API returned status ${response.status}: ${response.statusText}`);
      return [];
    }

    const json: TrendingApiResponse = await response.json();

    if (!json.success || !Array.isArray(json.data)) {
      console.warn("[TrendTracker] API response format unexpected:", json);
      return [];
    }

    console.log(`[TrendTracker] Got ${json.data.length} trending products`);
    setCache(cacheKey, json.data);
    return json.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn("[TrendTracker] Request timed out — returning []");
    } else {
      console.warn("[TrendTracker] Fetch failed:", error instanceof Error ? error.message : "Unknown error");
    }
    return []; // Graceful fallback — tidak throw
  }
}