/**
 * Validasi URL publik sebelum di-fetch — worker (SSRF guard).
 *
 * Menolak (throw) jika URL:
 *   - protocol selain `https:`
 *   - data: URI
 *   - menunjuk ke IP private (127.x, 10.x, 172.16–31.x, 192.168.x, 169.254.x)
 *     atau loopback IPv6 (::1)
 *
 * Dipakai di dua lapis:
 *   - Lapis 1: route /api/generate-video (sebelum job di-enqueue)
 *   - Lapis 2: fetchBuffer() di worker/src/render.ts (satu choke point yang
 *     melindungi semua call site fetchBuffer)
 */

/** Deteksi host yang menunjuk ke IP private / loopback / link-local. */
function isPrivateIpHost(host: string): boolean {
  const bare = host.replace(/^\[/, "").replace(/\]$/, "");

  // IPv6 loopback
  if (bare === "::1") return true;

  // IPv4 (strip port bila ada)
  const parts = bare.split(":")[0].split(".");
  if (parts.length !== 4) return false;
  if (!parts.every((p) => /^\d{1,3}$/.test(p))) return false;
  const [a, b] = parts.map((p) => Number(p));
  if (a === 127) return true;                       // 127.0.0.0/8 loopback
  if (a === 10) return true;                        // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;          // 192.168.0.0/16
  if (a === 169 && b === 254) return true;          // 169.254.0.0/16 link-local
  return false;
}

/**
 * Validasi URL publik. Throw Error jika URL tidak memenuhi kriteria aman
 * (https-only, bukan data URI, bukan IP private).
 */
export function validatePublicUrl(url: string): void {
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("URL kosong");
  }
  if (url.startsWith("data:")) {
    throw new Error("data URI dilarang");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL tidak valid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("hanya https yang diizinkan");
  }
  if (isPrivateIpHost(parsed.host)) {
    throw new Error("URL menuju IP private dilarang");
  }
}