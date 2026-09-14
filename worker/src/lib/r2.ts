/**
 * Cloudflare R2 — upload & delete objek video (worker)
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    throw new Error(
      "[r2] Konfigurasi R2 tidak lengkap. Pastikan R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, dan R2_PUBLIC_URL terisi di .env"
    );
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl: publicUrl.replace(/\/+$/, ""),
  };
}

let _client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!_client) {
    const cfg = getR2Config();
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      requestHandler: {
        requestTimeout: 120_000, // 2 menit — cegah "stuck di 100%"
      },
    });
  }
  return _client;
}

/** Upload buffer ke R2, return public URL */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const cfg = getR2Config();
  await getR2Client().send(
    new PutObjectCommand({ Bucket: cfg.bucketName, Key: key, Body: buffer, ContentType: contentType })
  );
  return `${cfg.publicUrl}/${key}`;
}

/** Hapus objek dari R2 */
export async function deleteFromR2(key: string): Promise<void> {
  const cfg = getR2Config();
  await getR2Client().send(new DeleteObjectCommand({ Bucket: cfg.bucketName, Key: key }));
}
