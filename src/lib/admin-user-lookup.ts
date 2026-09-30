/**
 * Lookup user dari Auth (auth.users) via admin.listUsers — helper bersama.
 *
 * Konteks bug (POST /api/admin/set-plan selalu menjawab "User tidak ditemukan.
 * Periksa userId/email." untuk email yang benar). Implementasi lama di route
 * punya tiga cacat yang SEMUANYA berujung ke pesan 404 yang sama, sehingga
 * penyebab aslinya tidak pernah terlihat:
 *
 *   1. `if (error) return null` — kegagalan Auth API (kunci service-role
 *      invalid/kadaluarsa, rate limit 429, jaringan, project pause) dibungkus
 *      menjadi "tidak ditemukan" TANPA log.
 *   2. hanya halaman 1 (`page: 1, perPage: 1000` tanpa loop) — user ke-1001+
 *      tak pernah terlihat (pola paginasi benar sudah ada di admin-snapshot.ts
 *      dan admin-delta.ts, tetapi tidak dipakai di set-plan).
 *   3. pencocokan hanya `trim().toLowerCase()` — karakter tak terlihat
 *      (zero-width / NBSP / BOM) hasil copy-paste email dari WhatsApp, PDF,
 *      atau web tetap TIDAK cocok walau email tampak identik.
 *
 * Helper ini memisahkan dua keadaan itu secara eksplisit:
 *   - tidak ada di semua halaman → { userId: null }   (404 wajar)
 *   - Auth API gagal            → throw AuthLookupError (route → 500 + log)
 *
 * Modul ini TIDAK menyentuh jaringan sendiri: fungsi `listPage` disuntikkan
 * (dependency injection) supaya bisa diuji murni tanpa mock jaringan.
 */

/** Bentuk minimal user Auth yang dipakai lookup. */
export interface AuthUserLike {
  id: string;
  email?: string | null;
}

/** Sumber halaman user (pembungkus tipis `supabase.auth.admin.listUsers`). */
export type ListAuthUsersPage = (params: {
  page: number;
  perPage: number;
}) => Promise<AuthUserLike[]>;

/** Ukuran halaman yang dipakai seragam di seluruh aplikasi (perPage Auth API). */
export const AUTH_PAGE_SIZE = 1000;

/** Pagar pengaman: 50 halaman × 1000 = 50.000 user maksimum disisir. */
export const AUTH_MAX_PAGES = 50;

/** Maksimum saran email mirip yang dikembalikan saat tidak ada kecocokan. */
export const MAX_SUGGESTIONS = 3;

/** Dilempar saat Auth API gagal — BUKAN "user tidak ditemukan". */
export class AuthLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthLookupError";
  }
}

/**
 * Karakter tak terlihat yang sering ikut ter-copy: soft hyphen, zero-width
 * space/joiner/non-joiner, LRM/RLM, bidi embedding/override, word joiner,
 * invisible separator, dan BOM.
 */
const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF]/g;

/**
 * Normalisasi email untuk perbandingan:
 * NFKC (bentuk Unicode setara) → buang karakter tak terlihat → buang semua
 * spasi (termasuk NBSP) → lowercase.
 * Email tidak pernah mengandung spasi, jadi membuang seluruh spasi aman.
 */
export function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKC")
    .replace(INVISIBLE_RE, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * True bila jarak edit (Levenshtein) antara a dan b ≤ max, dengan keluar awal
 * agar murah. Dipakai hanya untuk saran "mungkin maksud Anda" (heuristik), jadi
 * false-negative langka tidak berdampak.
 */
export function isSimilarText(a: string, b: string, max = 2): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;

  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return false; // sisa baris tak mungkin kembali ≤ max
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Pecah email ternormalisasi menjadi local part + domain. */
function splitEmail(email: string): { local: string; domain: string } {
  const at = email.indexOf("@");
  if (at < 0) return { local: email, domain: "" };
  return { local: email.slice(0, at), domain: email.slice(at) };
}

export interface AuthUserMatch {
  /** userId bila ada kecocokan persis (setelah normalisasi). */
  userId: string | null;
  /** Email seperti tersimpan di Auth (bukan hasil normalisasi). */
  matchedEmail: string | null;
  /** Jumlah user yang diperiksa (dibandingkan) sampai cocok / halaman habis. */
  scanned: number;
  /** Jumlah halaman Auth API yang dipanggil. */
  pages: number;
  /** true → loop berhenti karena batas aman; data belum tentu selesai. */
  truncated: boolean;
  /**
   * Saran email mirip saat tidak ada kecocokan persis: typo (domain sama +
   * local part berjarak edit ≤ 2) diutamakan, lalu kecocokan parsial
   * (substring salah satu arah). Maksimum MAX_SUGGESTIONS.
   */
  suggestions: string[];
}

/**
 * Cari user berdasarkan email dengan menyisir SEMUA halaman Auth API.
 * Berhenti segera setelah kecocokan ditemukan. Melempar AuthLookupError bila
 * `listPage` gagal (kegagalan Auth API tidak boleh jadi "tidak ditemukan").
 */
export async function findAuthUserByEmail(
  listPage: ListAuthUsersPage,
  rawEmail: string,
  opts: { pageSize?: number; maxPages?: number } = {}
): Promise<AuthUserMatch> {
  const pageSize = opts.pageSize ?? AUTH_PAGE_SIZE;
  const maxPages = opts.maxPages ?? AUTH_MAX_PAGES;
  const wanted = normalizeEmail(rawEmail);

  const result: AuthUserMatch = {
    userId: null,
    matchedEmail: null,
    scanned: 0,
    pages: 0,
    truncated: false,
    suggestions: [],
  };

  // Email kosong/hanya spasi: tidak ada gunanya menyisir seluruh user.
  if (!wanted) return result;

  // Saran "mungkin maksud Anda": typo (domain sama + local part mirip) lebih
  // diutamakan daripada kecocokan parsial (input belum lengkap).
  const wantedParts = splitEmail(wanted);
  const typoMatches: string[] = [];
  const partialMatches: string[] = [];
  const suggestionSlotsFull = () =>
    typoMatches.length >= MAX_SUGGESTIONS && partialMatches.length >= MAX_SUGGESTIONS;

  const considerSuggestion = (raw: string, email: string) => {
    const parts = splitEmail(email);
    if (
      parts.domain !== "" &&
      parts.domain === wantedParts.domain &&
      isSimilarText(wantedParts.local, parts.local)
    ) {
      typoMatches.push(raw);
      return;
    }
    if (email.includes(wanted) || wanted.includes(email)) partialMatches.push(raw);
  };

  for (let page = 1; page <= maxPages; page += 1) {
    const users = (await listPage({ page, perPage: pageSize })) ?? [];
    result.pages = page;

    for (const u of users) {
      result.scanned += 1;
      const email = normalizeEmail(u.email);
      if (!email) continue; // user anonim / tanpa email
      if (email === wanted) {
        result.userId = u.id;
        result.matchedEmail = u.email ?? null;
        return result;
      }
      if (!suggestionSlotsFull()) considerSuggestion(u.email ?? "", email);
    }

    if (users.length < pageSize) break; // halaman terakhir
    if (page === maxPages) result.truncated = true;
  }

  result.suggestions = [...typoMatches, ...partialMatches].slice(0, MAX_SUGGESTIONS);

  return result;
}
