import { test, expect, describe } from "vitest";
import { isValidAudioBuffer } from "@/lib/audio-validation";

function mk(len: number) { return Buffer.alloc(len); }

describe("isValidAudioBuffer", () => {
  test("MP3 ID3v2 header -> valid", () => {
    const b = mk(256);
    b[0] = 0x49; b[1] = 0x44; b[2] = 0x33; // ID3
    expect(isValidAudioBuffer(b)).toBe(true);
  });

  test("MP3 frame sync -> valid", () => {
    const b = mk(256);
    b[0] = 0xff; b[1] = 0xfb;
    expect(isValidAudioBuffer(b)).toBe(true);
  });

  test("WAV RIFF -> valid", () => {
    const b = mk(256);
    b[0] = 0x52; b[1] = 0x49; b[2] = 0x46; b[3] = 0x46; // RIFF
    expect(isValidAudioBuffer(b)).toBe(true);
  });

  test("OGG OggS -> valid", () => {
    const b = mk(256);
    b[0] = 0x4f; b[1] = 0x67; b[2] = 0x67; b[3] = 0x53; // OggS
    expect(isValidAudioBuffer(b)).toBe(true);
  });

  test("HTML error page -> invalid", () => {
    const b = Buffer.from("<html><body>error</body></html>" + "x".repeat(250), "utf8");
    expect(isValidAudioBuffer(b)).toBe(false);
  });

  test("buffer terlalu pendek -> invalid", () => {
    expect(isValidAudioBuffer(mk(64))).toBe(false);
    37
  });

  test("null -> invalid", () => {
    expect(isValidAudioBuffer(null as any)).toBe(false);
  });
});
