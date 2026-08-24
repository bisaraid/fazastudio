/**
 * API Authentication helper — ACS
 *
 * STRATEGI:
 * 1. Jika request berasal dari origin yang sama (frontend sendiri) → izinkan tanpa API key
 * 2. Jika request dari origin berbeda (eksternal/integrasi) → WAJIB X-API-Key valid
 * 3. Jika API_SECRET_KEY tidak diset → skip auth (development mode)
 */

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function extractDomain(host: string): string {
  return host.split(":")[0];
}

export function validateApiKey(request: Request): { valid: boolean; error?: string; isSameOrigin: boolean } {
  const apiKey = process.env.API_SECRET_KEY;

  if (!apiKey) {
    console.warn("⚠️ API_SECRET_KEY tidak diset — autentikasi API dilewati");
    return { valid: true, isSameOrigin: true };
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  const appDomain = process.env.APP_DOMAIN;
  const appDomainClean = appDomain ? stripProtocol(appDomain) : "";
  const appDomainHost = appDomainClean ? extractDomain(appDomainClean) : "";

  let isSameOrigin = false;

  if (origin && appDomain && origin.startsWith(appDomain)) {
    isSameOrigin = true;
  } else if (referer && appDomain && referer.startsWith(appDomain)) {
    isSameOrigin = true;
  } else if (host && appDomainHost) {
    const requestDomain = extractDomain(host);
    if (requestDomain === appDomainHost) {
      isSameOrigin = true;
    }
  } else if (!appDomain && host) {
    isSameOrigin = true;
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