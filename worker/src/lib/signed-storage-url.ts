/**
 * Resolve URL storage Supabase (worker)
 * Bucket acs-audio & acs-subtitles PRIVATE → path perlu dijadikan signed URL.
 */
import { getServiceRoleClient } from "./supabase";

const SIGNED_URL_TTL_SECONDS = 3600; // 1 jam

export function isStoragePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("http://") &&
    !value.startsWith("https://") &&
    !value.startsWith("data:")
  );
}

export async function getSignedStorageUrl(
  bucket: string,
  path: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  try {
    const { data, error } = await getServiceRoleClient().storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
      console.warn(`[signed-storage-url] gagal bucket=${bucket}: ${error?.message ?? "no data"}`);
      return null;
    }
    return data.signedUrl;
  } catch (e) {
    console.warn(`[signed-storage-url] throw bucket=${bucket}:`, (e as Error)?.message);
    return null;
  }
}

/** Resolve: path storage → signed URL; URL http/https/data → apa adanya */
export async function resolveMediaUrl(
  bucket: string,
  value: string | null | undefined
): Promise<string | null> {
  if (!value) return null;
  if (isStoragePath(value)) return getSignedStorageUrl(bucket, value);
  return value;
}
