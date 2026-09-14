/**
 * Audio validation helper — worker
 * Validasi magic bytes buffer audio (MP3/WAV/OGG).
 */
export function isValidAudioBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 128) return false;
  // MP3 ID3v2
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  // MP3 frame sync
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  // WAV RIFF
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true;
  // OGG OggS
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return true;
  return false;
}
