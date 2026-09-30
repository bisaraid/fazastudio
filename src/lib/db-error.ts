/**
 * Sanitasi error Supabase / Postgres untuk LOG SERVER — tanpa PII.
 *
 * Latar (bug 2026-09-30 "Gagal memperbarui plan"):
 * - Pesan/`details` Postgres bisa memuat nilai baris, mis.
 *   `Key (user_id, period)=(<uuid>, 2026-09) already exists.`
 * - `message`/`hint` dari provider bisa memuat alamat email atau token.
 * Semua teks yang keluar lewat modul ini sudah diredaksi:
 *   email → [email], uuid → [uuid], token JWT → [token].
 *
 * Kode error Postgres yang relevan untuk jalur TULIS `user_usage`:
 *   23502 → NOT NULL dilanggar (mis. `identity_key` tidak diisi)   ← akar bug set-plan
 *   42P10 → ON CONFLICT tidak punya unique index/constraint yang cocok
 *   23505 → unique dilanggar (baris duplikat (user_id, period))
 *   42501 → permission denied (kunci/role salah, RLS)
 *   42P01 → relasi tidak ada (migration belum dijalankan)
 *   PGRST116/PGRST202 → PostgREST: 0 baris / fungsi belum ada
 */

export interface SupabaseErrorInfo {
  /** Kode Postgres (`23502`) atau PostgREST (`PGRST202`); `unknown` bila tak ada. */
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}

const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const TOKEN_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}/g;

/** Ganti email / uuid / JWT dengan penanda aman (untuk log). */
export function redactPii(value: unknown): string {
  let text: string;
  if (typeof value === "string") text = value;
  else if (value === null || value === undefined) text = "";
  else if (value instanceof Error) text = value.message;
  // Objek lain → representasi generik (isi baris TIDAK ikut tercetak).
  else text = "[object]";

  return text.replace(EMAIL_RE, "[email]").replace(UUID_RE, "[uuid]").replace(TOKEN_RE, "[token]");
}

/** Masker id (uuid) untuk log: cukup 8 karakter pertama untuk korelasi. */
export function maskId(id: unknown): string {
  const text = typeof id === "string" ? id.trim() : "";
  if (!text) return "(kosong)";
  return text.length <= 8 ? `${text}…` : `${text.slice(0, 8)}…`;
}

/**
 * Normalisasi error Supabase/Postgres menjadi `{ code, message, details, hint }`
 * yang aman dicatat. Field kosong (`""`) → `null` supaya log seragam.
 */
export function describeSupabaseError(error: unknown): SupabaseErrorInfo {
  if (error === null || error === undefined) {
    return { code: "unknown", message: "(tidak ada error)", details: null, hint: null };
  }

  // Error PostgREST/Postgres: objek polos { code, message, details, hint }.
  if (typeof error === "object" && !(error instanceof Error)) {
    const e = error as Record<string, unknown>;
    const str = (key: string): string | null => {
      const value = e[key];
      return typeof value === "string" && value.trim() !== "" ? redactPii(value) : null;
    };
    const message = str("message") ?? "(tanpa pesan)";
    const rawCode = typeof e.code === "string" ? e.code.trim() : "";

    // supabase-js membungkus kegagalan fetch/jaringan sebagai error PostgREST
    // TANPA kode Postgres: { code: "", message: "Error: fetch failed: …" }.
    // Ditandai `fetch_failed` supaya beda dengan error DB beneran.
    const code =
      rawCode ||
      (message.startsWith("Error:") ? "fetch_failed" : "") ||
      "unknown";

    return {
      code,
      message,
      details: str("details"),
      hint: str("hint"),
    };
  }

  // Error yang dilempar (mis. fetch gagal) — sertakan kode Node bila ada.
  const code = (error as { code?: unknown }).code;
  return {
    code: typeof code === "string" && code !== "" ? code : "uncaught_error",
    message: redactPii(error),
    details: null,
    hint: null,
  };
}

/** Satu baris log: `code=… message=… details=… hint=…` (selalu ter-redaksi). */
export function formatSupabaseError(info: SupabaseErrorInfo | null | undefined): string {
  if (!info) return "code=unknown message=(tidak ada error) details=null hint=null";
  return (
    `code=${redactPii(info.code)} ` +
    `message=${redactPii(info.message)} ` +
    `details=${info.details ? redactPii(info.details) : "null"} ` +
    `hint=${info.hint ? redactPii(info.hint) : "null"}`
  );
}

/**
 * Referensi log singkat (`sp-ab12cd34`) — dikirim ke UI agar admin bisa
 * menyebutkannya saat melapor, TANPA membocorkan detail internal ke klien.
 */
export function newLogRef(prefix = "sp"): string {
  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return `${prefix}-${rand}`;
}
