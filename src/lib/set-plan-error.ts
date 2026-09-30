/**
 * Pesan kegagalan aktivasi plan untuk UI admin (/admin/transaksi).
 *
 * Dipisah dari komponen supaya bisa diuji tanpa DOM. Kontrak dengan
 * POST /api/admin/set-plan: field `code` membedakan
 *   - "user_not_found"     → email belum terdaftar (bukan salah server)
 *   - "auth_lookup_failed" → layanan Auth tidak bisa dihubungi
 *   - "plan_write_failed"  → lookup sukses, TULIS plan ke DB gagal
 *                            (pesan server memuat kode referensi log; detail
 *                            teknis hanya ada di log server)
 * Tanpa `code`, UI jatuh ke pesan dari server (atau generik bila kosong).
 */

/** Server tidak terjangkau dari browser (fetch reject / respons bukan JSON). */
export const NETWORK_ERROR_MESSAGE =
  "Gagal menghubungi server. Periksa koneksi internet lalu coba lagi.";

/** Respons diterima tetapi tidak dapat dibaca sebagai pesan kegagalan. */
export const UNKNOWN_ERROR_MESSAGE =
  "Server mengirim respons tak dikenal. Coba lagi sebentar lagi.";

export interface SetPlanErrorBody {
  code?: string;
  error?: string;
  /** Kode referensi log server (dikirim bersama code "plan_write_failed"). */
  ref?: string;
}

/**
 * Terjemahkan body kegagalan menjadi pesan yang membedakan
 * "email belum terdaftar" dari "gagal menghubungi/memproses di server".
 * `body` null → server tak terjangkau atau respons bukan JSON.
 */
export function setPlanErrorMessage(
  body: SetPlanErrorBody | null,
  status?: number
): string {
  if (!body) {
    return status ? `${UNKNOWN_ERROR_MESSAGE} (HTTP ${status})` : NETWORK_ERROR_MESSAGE;
  }

  if (body.code === "user_not_found") {
    return body.error || "Email belum terdaftar sebagai user.";
  }

  if (body.code === "auth_lookup_failed") {
    return body.error || "Gagal menghubungi layanan Auth untuk mencari user.";
  }

  if (body.code === "plan_write_failed") {
    // Pesan server sudah ramah + memuat kode referensi log; jangan tampilkan
    // detail database (hanya ada di log server).
    return (
      body.error ||
      "Gagal menyimpan plan ke database. Hubungi admin/dev dan sebutkan kode referensi di log server."
    );
  }

  if (body.error) return body.error;

  return status
    ? `${UNKNOWN_ERROR_MESSAGE} (HTTP ${status})`
    : "Aktivasi gagal. Coba lagi.";
}
