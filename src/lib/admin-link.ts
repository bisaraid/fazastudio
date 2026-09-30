/**
 * Visibilitas link "Panel Admin" di aplikasi utama (dropdown akun navbar,
 * drawer mobile, dan header landing).
 *
 * Aturan: render HANYA bila status admin sudah diketahui dan bernilai `true`.
 *   - `true`                    → tampilkan link
 *   - `false`                   → sembunyikan
 *   - `null` / `undefined` / `{}` (profil belum termuat, belum login, atau
 *     field `is_admin` tidak ada di respons) → JANGAN render apa pun —
 *     tanpa kedip dan tanpa menebak.
 *
 * Murni kosmetik: otorisasi sebenarnya tetap di server (`requireAdmin` di
 * semua endpoint /api/admin/* + api/admin/check), bukan dari fungsi ini.
 */
export function showAdminLink(
  profile: { is_admin?: unknown } | null | undefined
): boolean {
  return profile?.is_admin === true;
}
