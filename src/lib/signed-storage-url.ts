import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * Helper URL storage ter-signed — Faza Studio (ACS).
 *
 * Bucket `acs-audio` dan `acs-subtitles` kini PRIVATE (migration 017).
 * Kolom `audio_url`/`subtitle_url` di tabel `projects` menyimpan PATH OBJECT
 * (mis. "projectId/audio-123.mp3"), BUKAN URL publik. Saat akan dipakai,
 * path diubah menjadi signed URL segar (TTL 1 jam/3600 detik) via helper ini.
 *
 * URL lama (http/https/data URI) yang masih tersimpan diteruskan apa adanya
 * (backward compat).
 */

const SIGNED_URL_TTL_SECONDS = 3600; // 1 jam

/** True jika nilai adalah path storage (bukan URL/http/data URI). */
export function isStoragePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("http://") &&
    !value.startsWith("https://") &&
    !value.startsWith("data:")
  );
}

/** Buat signed URL segar untuk satu path di bucket tertentu. Return null jika gagal. */
export async function getSignedStorageUrl(
  bucket: string,
  path: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  try {
    const { data, error } = await createServiceRoleClient()
      .storage.from(bucket).createSignedUrl(path, expiresIn);

    if (error || !data?.signedUrl) {

      console.warn(`[signed-storage-url] createSignedUrl gagal bucket=${bucket}:`, error?.message ?? "no data");
      return null;
    }
    return data.signedUrl;

  } catch (e) {
    console.warn(`[signed-storage-url] createSignedUrl throw bucket=${bucket}:`, (e as Error)?.message);
    return null;
  }
}

/**
 * Resolve nilai URL media:
 * - Jika PATH storage → buat signed URL segar (TTL 1 jam).
 * - Jika URL sudah lengkap (http/https/data URI) → kembalikan apa adanya.

 * Return null hanya jika input null/undefined.
 */
export async function resolveMediaUrl(
  bucket: string,
  value: string | null | undefined
): Promise<string | null> {
  if (!value) return null;
  if (isStoragePath(value)) return getSignedStorageUrl(bucket, value);
  return value;
}