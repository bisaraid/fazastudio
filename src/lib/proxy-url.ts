/**
 * Shared URL validation helpers for audio/video proxy routes.
 *
 * Next.js App Router: route file TIDAK boleh ekspor anything di luar
 * HTTP methods (GET/POST/...). Jadi helper ini DIPISAH ke lib.
 * (Bukti: build time type-check "does not match the required types of a
 *  Next.js Route — X is not a valid Route export field").
 */

/** Ambil host dari URL; null jika tidak valid. */
export function hostOf(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

/**
 * Validasi URL target hanya dari daftar host yang diizinkan.
 * Pure & testable.
 */
export function isValidProxyUrl(
  targetUrl: string,
  allowedHosts: string[]
): boolean {
  if (!targetUrl || allowedHosts.length === 0) return false;
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return allowedHosts.includes(parsed.host);
  } catch {
    return false;
  }
}