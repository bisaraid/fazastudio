/**
 * Audio validation helper — ACS (Sesi B)
 *
 * Validasi bahwa buffer audio memang media (magic bytes), bukan HTML error
 * page / empty file. FFmpeg akan gagal anyway, tapi dengan error jelas
 * daripada cryptic "Invalid data found when processing input".
 *
 * Dipisah dari route file (Next.js route hanya mengizinkan ekspor HTTP methods)
 * agar bisa di-import + unit-test tanpa berdampak build.
 * Dukung MP3 (ID3/frame sync), WAV (RIFF), OGG (OggS).
 */
export function isValidAudioBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 128) return false;
  // MP3 ID3v2 header: "ID3"
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  // MP3 frame sync: 0xFF + (0xE0 mask) => 0xFB/0xF3 etc.
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  // WAV: "RIFF"
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
  // OGG: "OggS"
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return true;
  return false;
}