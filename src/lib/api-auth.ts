/**
 * API Authentication helper — ACS
 *
 * STRATEGI:
 * 1. Jika request berasal dari origin yang sama (frontend sendiri) → izinkan zonder API key
 * 2. Jika request dari origin berbeda (eksternal/integrasi) → WAJIB X-API-Key valid
 * 3. Jika API_SECRET_KEY tidak diset → skip auth (development mode)
 *
 * FAIL-CLOSED (REVISI):
 * - APP_DOMAIN WAJIB di-set. Kalau tidak di-set → semua request lintas-origin
 *   diweiger (geen fallback naar "allow all" meer).
 * - Vergelijking origin/Referer via EXACTE match (protocol + host + port),
 *   NIET prefix — zo kan `https://fazastudio.my.id.evil.com` nooit doorgaan
 *   alszelfde-origin.
 */

/** Normaliseer een absolute URL naar "protocol://host[:port]" (exact, zonder trailing slash). */
function normalizeOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Alleen http/https worden geaccepteerd.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    let port = "";
    const isDefaultPort =
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443");

    if (parsed.port && !isDefaultPort) {
      port = `:${parsed.port}`;
    }

    return `${parsed.protocol}//${parsed.host}${port}`;
  } catch {
    return null;
  }
}

/** Normaliseer APP_DOMAIN naar vergelijkbare origin-string. */
function normalizeAppDomain(appDomain: string): string | null {
  const trimmed = appDomain.trim();
  if (!trimmed) return null;

  // Als er geen protocol staat, default naar https://.
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return normalizeOrigin(withProtocol);
}

export function validateApiKey(request: Request): { valid: boolean; error?: string; isSameOrigin: boolean } {
  const apiKey = process.env.API_SECRET_KEY;

  if (!apiKey) {
    console.warn("⚠️ API_SECRET_KEY tidak diset — autentikasi API dilewati");
    return { valid: true, isSameOrigin: true };
  }

  const appDomain = process.env.APP_DOMAIN;

  // ===== FAIL-CLOSED (REVISI): APP_DOMAIN wajib =====
  // Zonder APP_DOMAIN kan same-origin nooit betrouwbaar geverifieerd worden.
  // Wij weigeren dan álle requests (behalve die met geldige X-API-Key).
  const normalizedApp = normalizeAppDomain(appDomain || "");
  if (!normalizedApp) {
    return {
      valid: false,
      error: "APP_DOMAIN tidak di-set — same-origin verificatie onmogelijk (fail-closed)",
      isSameOrigin: false,
    };
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  let isSameOrigin = false;

  // 1) Exacte vergelijking van Origin-header (protocol+host+port), NIET prefix.
  if (origin) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin && normalizedOrigin === normalizedApp) {
      isSameOrigin = true;
    }
  }
  // 2) Fallback: Referer exact vergelijken (voor non-browser/opaque clients zonder Origin).
  else if (referer) {
    const normalizedReferer = normalizeOrigin(referer);
    if (normalizedReferer && normalizedReferer === normalizedApp) {
      isSameOrigin = true;
    }
  }
  // 3) Laatste fallback: Host-header exact vergelijken (zonder Origin/Referer).
  else if (host) {
    const normalizedHost = normalizeOrigin(`https://${host}`);
    if (normalizedHost && normalizedHost === normalizedApp) {
      isSameOrigin = true;
    }
  }

  if (isSameOrigin) {
    return { valid: true, isSameOrigin: true };
  }

  const providedKey = request.headers.get("x-api-key");

  if (!providedKey) {
    return { valid: false, error: "Header X-API-Key wajib disertakan untuk akses eksternal", isSameOrigin: false };
  }

  if (providedKey !== apiKey) {
    return { valid: false, error: "X-API-Key tidak valid", isSameOrigin: false };
  }

  return { valid: true, isSameOrigin: false };
}