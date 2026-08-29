import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 — upload & delete objek video.
 *
 * Video (hasil render FFmpeg) disimpan di R2, bukan Supabase Storage.
 * Supabase tetap dipakai untuk: projects, usage, audio, subtitle.
 *
 * Struktur key (ditentukan oleh pemanggil, misal route generate-video):
 * - Free:    "free/{identityKey}/{timestamp}.mp4"      → dihapus R2 lifecycle (24 jam)
 * - Premium: "premium/{identityKey}/{timestamp}.mp4"   → permanen (tanpa lifecycle rule)
 *
 * Konfigurasi via env:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *   R2_PUBLIC_URL
 */

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

/** Baca konfigurasi R2 dari env. Throw jika ada yang tidak diset (fail-fast). */
function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    throw new Error(
      "Konfigurasi R2 tidak lengkap. Pastikan R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, dan R2_PUBLIC_URL terisi di .env"
    );
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    // Pastikan publicUrl tidak punya trailing slash agar concat aman.
    publicUrl: publicUrl.replace(/\/+$/, ""),
  };
}

/** S3Client yang dikonfigurasi untuk endpoint Cloudflare R2. */
export function createR2Client(): S3Client {
  const cfg = getR2Config();
  return new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

const r2Client = createR2Client();

/**
 * Upload buffer ke R2 pada key tertentu.
 * Return public URL (R2_PUBLIC_URL + "/" + key).
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const cfg = getR2Config();
  await r2Client.send(
    new PutObjectCommand({
      Bucket: cfg.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return `${cfg.publicUrl}/${key}`;
}

/** Hapus objek dari R2 berdasarkan key. */
export async function deleteFromR2(key: string): Promise<void> {
  const cfg = getR2Config();
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: cfg.bucketName,
      Key: key,
    })
  );
}