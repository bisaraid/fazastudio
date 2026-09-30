/**
 * Onboarding persona (4 layer) — helper murni + I/O tipis.
 *
 * Dipakai oleh:
 * - `src/app/mulai/page.tsx` (wizard): jalan keluar eksplisit (simpan / lanjut)
 *   + navigasi KERAS supaya user tidak bisa terjebak di langkah terakhir.
 * - `src/middleware.ts` (gate): definisi "sudah onboarding?" hanya SATU tempat,
 *   agar gate dan wizard tidak pernah berbeda pendapat.
 *
 * Konteks bug: halaman /mulai dulu "menyegel" dirinya di langkah terakhir —
 * tidak ada tombol lanjut dan semua tombol di-`disable` selagi `saving`
 * (saving tidak pernah di-reset di jalur sukses). Satu-satunya jalan keluar
 * adalah `router.push(next)` yang ditunda 1,5 detik. Bila navigasi lunak itu
 * tidak terjadi/tertelan (mis. middleware memantulkan `/beranda` kembali ke
 * URL yang sama sehingga App Router membatalkan navigasi), user berhenti
 * selamanya di layar "Profil kamu siap!" tanpa pesan apa pun.
 *
 * Modul ini tidak mengimpor apa pun (aman untuk Edge middleware maupun test).
 */

/** Kolom `profiles` yang menyimpan pilihan wizard (Layer 1-4). */
export const PERSONA_COLUMNS = ["layer1_mode", "niche_slug", "gaya_key", "cerita_key"] as const;

/** Tujuan default setelah onboarding selesai. */
export const HOME_AFTER_ONBOARDING = "/beranda";

/** Jawaban wizard dalam bentuk yang dipakai UI (camelCase). */
export interface PersonaAnswers {
  mode: string;
  niche: string;
  gaya: string;
  cerita: string;
}

export const EMPTY_PERSONA: PersonaAnswers = { mode: "", niche: "", gaya: "", cerita: "" };

/** Body POST /api/profile (camelCase — sesuai kontrak route). */
export interface PersonaRequestBody {
  layer1Mode: string;
  nicheSlug: string;
  gayaKey: string;
  ceritaKey: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Baca jawaban persona dari baris `profiles` (GET /api/profile atau query
 * middleware). Baris null / kolom kosong → string kosong (bukan "undefined").
 */
export function personaFromProfile(profile: unknown): PersonaAnswers {
  if (!profile || typeof profile !== "object") return { ...EMPTY_PERSONA };
  const row = profile as Record<string, unknown>;
  return {
    mode: str(row.layer1_mode),
    niche: str(row.niche_slug),
    gaya: str(row.gaya_key),
    cerita: str(row.cerita_key),
  };
}

/** Onboarding dianggap selesai hanya bila KEEMPAT layer terisi (non-whitespace). */
export function isOnboardingComplete(answers: Partial<PersonaAnswers> | null | undefined): boolean {
  if (!answers) return false;
  return !!str(answers.mode) && !!str(answers.niche) && !!str(answers.gaya) && !!str(answers.cerita);
}

/** Body POST /api/profile dari jawaban wizard. */
export function personaRequestBody(answers: PersonaAnswers): PersonaRequestBody {
  return {
    layer1Mode: answers.mode,
    nicheSlug: answers.niche,
    gayaKey: answers.gaya,
    ceritaKey: answers.cerita,
  };
}

/**
 * Normalisasi `?next=` sebelum dipakai navigasi.
 *
 * - kosong / bukan path absolut / `//host` (open-redirect) / `"/"` → /beranda
 * - mengarah kembali ke /mulai (loop) → /beranda  ← kunci anti-jebakan
 * - query & hash tetap dipertahankan (mis. `/konten/abc?tab=script`)
 */
export function normalizeNextPath(raw: string | null | undefined): string {
  const value = str(raw);
  if (!value || !value.startsWith("/") || value.startsWith("//")) return HOME_AFTER_ONBOARDING;
  const pathOnly = value.split(/[?#]/)[0];
  if (pathOnly === "/" || pathOnly === "/mulai") return HOME_AFTER_ONBOARDING;
  return value;
}

export type SavePersonaResult =
  | { ok: true }
  | { ok: false; error: string; retryable: boolean };

export interface SavePersonaOptions {
  /** Inject fetch untuk test; default `globalThis.fetch`. */
  fetchImpl?: typeof fetch | null;
  /** Batas waktu (ms) supaya tombol tidak pernah "loading" selamanya. */
  timeoutMs?: number;
  /** Endpoint; default `/api/profile`. */
  url?: string;
}

/**
 * Simpan persona ke /api/profile. TIDAK PERNAH throw — selalu mengembalikan
 * hasil yang bisa ditampilkan ke user (pesan error jelas, bukan diam).
 */
export async function savePersona(
  answers: PersonaAnswers,
  options: SavePersonaOptions = {}
): Promise<SavePersonaResult> {
  const fetchImpl = options.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
  if (!fetchImpl) {
    return { ok: false, error: "Tidak bisa menghubungi server.", retryable: true };
  }

  const timeoutMs = options.timeoutMs ?? 10000;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetchImpl(options.url ?? "/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(personaRequestBody(answers)),
      signal: controller ? controller.signal : undefined,
    });

    // Body bisa bukan JSON (mis. halaman error HTML dari platform) → jangan
    // biarkan `res.json()` melempar dan menyembunyikan pesan asli.
    let json: { success?: boolean; error?: unknown } | null = null;
    try {
      json = (await res.json()) as { success?: boolean; error?: unknown };
    } catch {
      json = null;
    }

    if (!res.ok || json?.success !== true) {
      const serverMessage = typeof json?.error === "string" ? json.error.trim() : "";
      return {
        ok: false,
        error: serverMessage || `Gagal menyimpan profil (server merespons ${res.status}).`,
        retryable: res.status >= 500 || res.status === 408 || res.status === 429,
      };
    }

    return { ok: true };
  } catch (e) {
    const aborted =
      controller?.signal.aborted === true ||
      (e as { name?: string } | null)?.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "Server terlalu lama merespons. Periksa koneksi lalu coba lagi."
        : "Gagal menghubungi server (jaringan). Coba lagi.",
      retryable: true,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Target minimal untuk hard navigate (memudahkan test tanpa DOM). */
export interface NavigationTarget {
  assign?: (url: string) => void;
  href?: string;
}

/**
 * Navigasi KERAS (full document load) ke tujuan.
 *
 * Kenapa bukan `router.push`: cache router client bisa menyimpan redirect lama
 * `/beranda → /mulai?next=/beranda`, sehingga navigasi lunak tidak pernah
 * merender halaman baru dan user tetap terjebak di UI lama. Muat ulang dokumen
 * menjamin middleware mengevaluasi profil yang BARU disimpan.
 */
export function navigateTo(path: string, target?: NavigationTarget | null): void {
  const dest = normalizeNextPath(path);
  const loc = target ?? (typeof window !== "undefined" ? window.location : null);
  if (!loc) return;
  if (typeof loc.assign === "function") {
    loc.assign(dest);
    return;
  }
  loc.href = dest;
}
