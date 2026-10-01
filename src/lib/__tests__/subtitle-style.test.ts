import { test, expect, describe } from "vitest";
import {
  computeSubtitleStyle,
  buildForceStyle,
  hexToAssColor,
  getSubtitlePlatformProfile,
} from "@/lib/subtitle-style";

describe("getSubtitlePlatformProfile - tabel platform", () => {
  test("nilai profil per platform (spek: font 48-60px @1080)", () => {
    expect(getSubtitlePlatformProfile("tiktok")).toEqual({
      fontPx: 54, marginBottomPct: 0.24, marginLeftPct: 0.06, marginRightPct: 0.16, maxLines: 2,
    });
    expect(getSubtitlePlatformProfile("reels")).toEqual({
      fontPx: 52, marginBottomPct: 0.24, marginLeftPct: 0.06, marginRightPct: 0.18, maxLines: 2,
    });
    expect(getSubtitlePlatformProfile("youtube")).toEqual({
      fontPx: 56, marginBottomPct: 0.20, marginLeftPct: 0.04, marginRightPct: 0.04, maxLines: 2,
    });
    expect(getSubtitlePlatformProfile("podcast")).toEqual({
      fontPx: 48, marginBottomPct: 0.20, marginLeftPct: 0.08, marginRightPct: 0.08, maxLines: 2,
    });
    expect(getSubtitlePlatformProfile("shopee")).toEqual({
      fontPx: 50, marginBottomPct: 0.22, marginLeftPct: 0.06, marginRightPct: 0.18, maxLines: 2,
    });
  });

  test("case-insensitive", () => {
    expect(getSubtitlePlatformProfile("TiKtOk")).toEqual(getSubtitlePlatformProfile("tiktok"));
  });

  test("platform kosong/project lama/tak dikenal → fallback aman tiktok", () => {
    const tiktok = getSubtitlePlatformProfile("tiktok");
    expect(getSubtitlePlatformProfile(undefined)).toEqual(tiktok);
    expect(getSubtitlePlatformProfile(null)).toEqual(tiktok);
    expect(getSubtitlePlatformProfile("")).toEqual(tiktok);
    expect(getSubtitlePlatformProfile("shorts")).toEqual(tiktok);
  });

  test("semua platform memenuhi spek: font 48-60px, margin bawah 20-25%, maks 2 baris", () => {
    for (const p of ["tiktok", "reels", "youtube", "podcast", "shopee"]) {
      const prof = getSubtitlePlatformProfile(p);
      expect(prof.fontPx).toBeGreaterThanOrEqual(48);
      expect(prof.fontPx).toBeLessThanOrEqual(60);
      expect(prof.marginBottomPct).toBeGreaterThanOrEqual(0.20);
      expect(prof.marginBottomPct).toBeLessThanOrEqual(0.25);
      expect(prof.maxLines).toBe(2);
      // Margin kiri-kanan cukup lebar (bukan nol) & masuk akal (<35% lebar).
      expect(prof.marginLeftPct).toBeGreaterThanOrEqual(0.04);
      expect(prof.marginLeftPct).toBeLessThanOrEqual(0.35);
      expect(prof.marginRightPct).toBeGreaterThanOrEqual(0.04);
      expect(prof.marginRightPct).toBeLessThanOrEqual(0.35);
    }
  });
});

describe("computeSubtitleStyle - PlayRes & ukuran piksel nyata", () => {
  test("PlayRes = ukuran video output (kunci fix skala libass)", () => {
    const portrait = computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "tiktok" });
    expect(portrait.playResX).toBe(1080);
    expect(portrait.playResY).toBe(1920);
    const landscape = computeSubtitleStyle({ outW: 1920, outH: 1080, platform: "youtube" });
    expect(landscape.playResX).toBe(1920);
    expect(landscape.playResY).toBe(1080);
  });

  test("tiktok portrait → font 54px, margin zona aman dalam px", () => {
    const r = computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "tiktok" });
    expect(r.fontSize).toBe(54);
    expect(r.marginL).toBe(65);   // 6% x 1080
    expect(r.marginR).toBe(173);  // 16% x 1080 (rail UI kanan)
    expect(r.marginV).toBe(461);  // 24% x 1920 (zona aman bawah)
    expect(r.outline).toBe(3);    // px
    expect(r.shadow).toBe(2);     // px
  });

  test("youtube landscape → font 56px, margin simetris", () => {
    const r = computeSubtitleStyle({ outW: 1920, outH: 1080, platform: "youtube" });
    expect(r.fontSize).toBe(56);
    expect(r.marginL).toBe(77);  // 4% x 1920
    expect(r.marginR).toBe(77);
    expect(r.marginV).toBe(216); // 20% x 1080
  });

  test("font proporsional thd short-side (720x1280 → 36px & margin ikut)", () => {
    const r = computeSubtitleStyle({ outW: 720, outH: 1280, platform: "tiktok" });
    expect(r.fontSize).toBe(36);  // 54 x (720/1080)
    expect(r.marginL).toBe(43);   // 6% x 720
    expect(r.marginV).toBe(307);  // 24% x 1280
  });
});

describe("computeSubtitleStyle - font size", () => {
  test("input UI >= 32px dihormati (satuan px)", () => {
    const r = computeSubtitleStyle({ style: { fontSize: 72 }, outW: 1080, outH: 1920 });
    expect(r.fontSize).toBe(72);
  });

  test("nilai legacy 28 (default lama, satuan PlayRes) → pakai profil platform", () => {
    const r = computeSubtitleStyle({ style: { fontSize: 28 }, outW: 1080, outH: 1920, platform: "tiktok" });
    expect(r.fontSize).toBe(54);
    const yt = computeSubtitleStyle({ style: { fontSize: 28 }, outW: 1920, outH: 1080, platform: "youtube" });
    expect(yt.fontSize).toBe(56);
  });

  test("clamp fontSize ekstrem ke 24..120 px", () => {
    const big = computeSubtitleStyle({ style: { fontSize: 500 }, outW: 1080, outH: 1920 });
    expect(big.fontSize).toBe(120);
    const small = computeSubtitleStyle({ style: { fontSize: 31 }, outW: 1080, outH: 1920 });
    expect(small.fontSize).toBe(54); // < 32 dianggap auto → profil
  });

  test("default tanpa style → profil platform (bukan angka PlayRes lama)", () => {
    expect(computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "reels" }).fontSize).toBe(52);
    expect(computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "shopee" }).fontSize).toBe(50);
    expect(computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "podcast" }).fontSize).toBe(48);
  });

  test("outline clamp px 1..6", () => {
    expect(computeSubtitleStyle({ style: { strokeWidth: 0 }, outW: 1080, outH: 1920 }).outline).toBe(1);
    expect(computeSubtitleStyle({ style: { strokeWidth: 99 }, outW: 1080, outH: 1920 }).outline).toBe(6);
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
  test("PlayResX/PlayResY DIDAHULUKAN (kunci fix ukuran) & semua field lengkap", () => {
    const r = computeSubtitleStyle({ style: { fontSize: 28 }, outW: 1080, outH: 1920, platform: "tiktok" });
    const fs = buildForceStyle(r);
    expect(fs.indexOf("PlayResX=1080,PlayResY=1920,FontName=")).toBe(0);
    expect(fs).toContain("FontSize=54");
    expect(fs).toContain("MarginL=65,MarginR=173");
    expect(fs).toContain("MarginV=461");
    expect(fs).toContain("BorderStyle=1");
    expect(fs).toContain("BackColour=");
    expect(fs).toContain("Alignment=2");
  });

  test("PlayRes landscape mengikuti output 1920x1080", () => {
    const r = computeSubtitleStyle({ outW: 1920, outH: 1080, platform: "youtube" });
    const fs = buildForceStyle(r);
    expect(fs.indexOf("PlayResX=1920,PlayResY=1080,FontName=")).toBe(0);
    expect(fs).toContain("FontSize=56");
    expect(fs).toContain("MarginV=216");
  });

  test("tanpa field PlayRes lama (regresi skala 6,67x) — nilai = px nyata", () => {
    const r = computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "tiktok" });
    const fs = buildForceStyle(r);
    // Angka gaya "PlayRes kecil" (30/24/26 + margin 31/17) tidak boleh muncul lagi.
    expect(fs).not.toContain("FontSize=30,");
    expect(fs).not.toContain("MarginV=17,");
    expect(r.playResY).toBe(1920);
  });
});
