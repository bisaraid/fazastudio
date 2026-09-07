/**
 * Admin authorization — berbasis AKUN (Supabase Auth), bukan shared secret.
 *
 * Cara kerja:
 *  1. User login normal (email/password/Google) via Supabase Auth.
 *  2. Route admin membaca user.session dari cookie (createSupabaseServerClient).
 *  3. Akses diizinkan jika:
 *     - profiles.is_admin = true (sudah di-promote), ATAU
 *     - email user ada di env ADMIN_EMAILS (bootstrap admin pertama) —
 *       route akan auto-promote is_admin=true saat login.
 *
 * Tanpa login → 401. Login tapi bukan admin → 403.
 * Tidak ada shared secret (ADMIN_SECRET dihapus).
 */

export interface AdminUserLike {
  id: string;
  email?: string | null;
}

/** Baca daftar email admin dari env ADMIN_EMAILS (comma-separated, lower-case). */
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** Cek apakah email user termasuk daftar ADMIN_EMAILS (bootstrap first admin). */
export function isAdminEmail(user: AdminUserLike | null | undefined): boolean {
  if (!user?.email) return false;
  const email = user.email.trim().toLowerCase();
  return getAdminEmails().includes(email);
}