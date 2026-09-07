import { test, expect, describe } from "vitest";
import { computeSubtitleStyle, buildForceStyle, hexToAssColor } from "@/lib/subtitle-style";

describe("computeSubtitleStyle - font size", () => {
  test("default portrait TikTok besar", () => {
    const r = computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "tiktok" });
    expect(r.fontSize).toBe(30);
    expect(r.borderStyle).toBe(1);
    expect(r.alignment).toBe(2);
  });

  test("hormati fontSize pengguna", () => {
    const r = computeSubtitleStyle({ style: { fontSize: 50 }, outW: 1080, outH: 1920 });
    expect(r.fontSize).toBe(50);
  });

  test("clamp fontSize ekstrem", () => {
    const big = computeSubtitleStyle({ style: { fontSize: 150 }, outW: 1080, outH: 1920 });
    const small = computeSubtitleStyle({ style: { fontSize: 4 }, outW: 1080, outH: 1920 });
    expect(big.fontSize).toBe(96);
    expect(small.fontSize).toBe(12);
  });

  test("youtube landscape default", () => {
    const r = computeSubtitleStyle({ outW: 1920, outH: 1080, platform: "youtube" });
    expect(r.fontSize).toBe(24);
  });
});

describe("subtitle-style - box & posisi", () => {
  test("backgroundColor -> BorderStyle 4 + BackColour alpha", () => {
    const r = computeSubtitleStyle({ style: { backgroundColor: "#000000", backgroundAlpha: 150 }, outW: 1080, outH: 1920 });
    expect(r.borderStyle).toBe(4);
    expect(r.backColour).toBe("&H96000000");
  });

  test("tanpa backgroundColor -> BorderStyle 1", () => {
    const r = computeSubtitleStyle({ outW: 1080, outH: 1920 });
    expect(r.borderStyle).toBe(1);
  });

  test("position top -> alignment 8", () => {
    const r = computeSubtitleStyle({ style: { position: "top" }, outW: 1080, outH: 1920 });
    expect(r.alignment).toBe(8);
  });
});

describe("hexToAssColor", () => {
  test("convert ke ASS BGR", () => {
    expect(hexToAssColor("#FFD700")).toBe("&H0000D7FF");
  });

  test("alpha untuk kotak", () => {
    expect(hexToAssColor("#000000", 150)).toBe("&H96000000");
  });
});

describe("buildForceStyle", () => {
  test("string lengkap mulai FontName & berisi BackColour", () => {
    const r = computeSubtitleStyle({ style: { fontSize: 28 }, outW: 1080, outH: 1920 });
    const fs = buildForceStyle(r);
    expect(fs.indexOf("FontName=")).toBe(0);
    expect(fs.indexOf("BackColour=")).toBeGreaterThan(0);
  });
});
