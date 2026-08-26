/**
 * Stable Device Identity — ACS / Faza Studio
 *
 * Mengganti basis identitas anon dari `anon:<ip>` menjadi `anon:<uuid>` yang
 * disimpan di cookie `device_id` (1 tahun). Ini menstabilkan identitas antar
 * request/perangkat, sehingga billing & credit (Pro/Tim via Midtrans) tetap
 * melekat ke perangkat yang sama — tidak hilang saat IP berubah.
 *
 * Module ini aman dipakai server & client:
 * - getServerIdentity  → dipanggil di API routes (server).
 * - getClientIdentity  → dipanggil di client component (memastikan cookie ada
 *   sebelum request API billing/kredit).
 * Menggunakan globalThis.crypto.randomUUID (Node 22+/browser) — tanpa import
 * node "crypto" agar tidak merusak client bundle.
 */

export const DEVICE_ID_COOKIE = "device_id";
export const DEVICE_ID_MAX_AGE = 31536000; // 1 tahun (detik)

export interface ServerIdentity {
  deviceId: string;
  identityKey: string;
  isNew: boolean;
}

/** Parse string header Cookie menjadi object. */
export function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(value);
      } catch {
        out[key] = value;
      }
    }
  });
  return out;
}

function generateDeviceId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Server-side: baca cookie `device_id` dari request.
 * Jika tidak ada → generate UUID baru dan tandai isNew = true
 * agar caller mengirim Set-Cookie pada response.
 */
export function getServerIdentity(request: Request): ServerIdentity {
  const cookieHeader = request.headers.get("cookie") || "";
  const existing = parseCookieHeader(cookieHeader)[DEVICE_ID_COOKIE];

  if (existing) {
    return { deviceId: existing, identityKey: `anon:${existing}`, isNew: false };
  }

  const deviceId = generateDeviceId();
  return { deviceId, identityKey: `anon:${deviceId}`, isNew: true };
}

/** Opsi cookie untuk Next ResponseCookies.set / Set-Cookie header. */
export function deviceCookieOptions(): { path: string; maxAge: number; sameSite: "lax" } {
  return { path: "/", maxAge: DEVICE_ID_MAX_AGE, sameSite: "lax" };
}

/** Bangun string Set-Cookie manual (untuk Response non-NextResponse, mis. SSE). */
export function buildDeviceCookieHeader(deviceId: string): string {
  return `${DEVICE_ID_COOKIE}=${deviceId}; Path=/; Max-Age=${DEVICE_ID_MAX_AGE}; SameSite=Lax`;
}

/**
 * Client-side: baca cookie `device_id`; jika tidak ada, generate + set.
 * Panggil pada mount (mis. halaman Settings) sebelum request billing agar
 * identitas stabil sejak awal.
 */
export function getClientIdentity(): string {
  const existing = parseCookieHeader(document.cookie)[DEVICE_ID_COOKIE];
  if (existing) return existing;

  const deviceId = generateDeviceId();
  document.cookie = setClientDeviceCookie(deviceId);
  return deviceId;
}

/** Hapus cookie `device_id` di client (dipakai aksi "Reset Identitas"). */
export function clearClientIdentity(): void {
  document.cookie = `${DEVICE_ID_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function setClientDeviceCookie(deviceId: string): string {
  return `${DEVICE_ID_COOKIE}=${encodeURIComponent(deviceId)}; Path=/; Max-Age=${DEVICE_ID_MAX_AGE}; SameSite=Lax`;
}