/**
 * Cache client sempel utk halaman admin — tanpa library eksternal.
 * TTL in-memory: jangan refetch data yang sama saat berpindah menu (anggp
 * pindah menu = halaman remount, state malam kan kosong, tapi cache module
 * module-level sirap).
 */

interface CacheEntry {
  expiresAt: number;
  data: unknown;
}

const cache = new Map<string, CacheEntry>();

/** Fetch + parse JSON dengan cache TTL. Throw Error jka response tidak OK. */
export async function adminCachedFetch<T>(
  key: string,
  url: string,
  ttlMs = 60000
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.data as T;

  const res = await fetch(url);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const msg =
      (json && (json as { error?: string }).error) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const json = await res.json();
  cache.set(key, { expiresAt: now + ttlMs, data: json });
  return json as T;
}

/** Memaksa refetch utk satu atau sekelap key (prefix). */
export function adminInvalidate(keyPrefix: string): void {
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(keyPrefix)) cache.delete(k);
  }
}