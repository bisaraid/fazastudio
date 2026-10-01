import { test, expect, describe } from "vitest";
import {
  computeSubtitleStyle,
  buildForceStyle,
  hexToAssColor,
  getSubtitlePlatformProfile,
} from "@/lib/subtitle-style";

// Dua masalah dari render nyata yang diperbaiki di sini:
//  (1) teks tidak di tengah → margin kiri/kanan tidak simetris;
//  (2) teks kurang terbaca di footage cerah → kotak latar BorderStyle=3.

describe("getSubtitlePlatformProfile - tabel platform", () => {
  test("nilai profil per platform (font 48-60px @1080; margin samping SIMETRIS)", () => {
    expect(getSubtitlePlatformProfile("tiktok")).toEqual({
      fontPx: 54, marginBottomPct: 0.24, marginLeftPct: 0.16, marginRightPct: 0.16, maxLines: 2,
    });
    expect(getSubtitlePlatformProfile("reels")).toEqual({
      fontPx: 52, marginBottomPct: 0.24, marginLeftPct: 0.16, marginRightPct: 0.16, maxLines: 2,
    });
    expect(getSubtitlePlatformProfile("youtube")).toEqual({
      fontPx: 56, marginBottomPct: 0.20, marginLeftPct: 0.12, marginRightPct: 0.12, maxLines: 2,
    });
    expect(getSubtitlePlatformProfile("podcast")).toEqual({
      fontPx: 48, marginBottomPct: 0.20, marginLeftPct: 0.12, marginRightPct: 0.12, maxLines: 2,
    });
    expect(getSubtitlePlatformProfile("shopee")).toEqual({
      fontPx: 50, marginBottomPct: 0.22, marginLeftPct: 0.16, marginRightPct: 0.16, maxLines: 2,
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

  test("semua platform: font 48-60px, margin bawah 20-25%, samping simetris 12-16%", () => {
    for (const p of ["tiktok", "reels", "youtube", "podcast", "shopee"]) {
      const prof = getSubtitlePlatformProfile(p);
      expect(prof.fontPx).toBeGreaterThanOrEqual(48);
      expect(prof.fontPx).toBeLessThanOrEqual(60);
      expect(prof.marginBottomPct).toBeGreaterThanOrEqual(0.20);
      expect(prof.marginBottomPct).toBeLessThanOrEqual(0.25);
      expect(prof.maxLines).toBe(2);
      // Margin kiri-kanan WAJIB SIMETRIS (teks tepat di tengah) & 12-16%.
      expect(prof.marginLeftPct).toBe(prof.marginRightPct);
      expect(prof.marginLeftPct).toBeGreaterThanOrEqual(0.12);
      expect(prof.marginLeftPct).toBeLessThanOrEqual(0.16);
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

  test("tiktok portrait → font 54px, margin KIRI = KANAN (teks tengah)", () => {
    const r = computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "tiktok" });
    expect(r.fontSize).toBe(54);
    expect(r.marginL).toBe(173);  // 16% x 1080
    expect(r.marginR).toBe(173);  // 16% x 1080 → SIMETRIS (fix teks bergeser kiri)
    expect(r.marginV).toBe(461);  // 24% x 1920 (zona aman bawah, tidak diubah)
    expect(r.outline).toBe(9);    // padding kotak = 16% x 54px
    expect(r.shadow).toBe(0);     // tanpa shadow → tepi kotak bersih
  });

  test("margin horizontal simetris di semua platform & resolusi", () => {
    const cases = [
      { platform: "tiktok", outW: 1080, outH: 1920 },
      { platform: "reels", outW: 1080, outH: 1920 },
      { platform: "shopee", outW: 1080, outH: 1920 },
      { platform: "podcast", outW: 1080, outH: 1920 },
      { platform: "youtube", outW: 1920, outH: 1080 },
      { platform: "tiktok", outW: 720, outH: 1280 },
    ];
    for (const c of cases) {
      const r = computeSubtitleStyle(c);
      expect(r.marginL).toBe(r.marginR);
    }
  });

  test("youtube landscape → font 56px, margin simetris 12%", () => {
    const r = computeSubtitleStyle({ outW: 1920, outH: 1080, platform: "youtube" });
    expect(r.fontSize).toBe(56);
    expect(r.marginL).toBe(230); // 12% x 1920
    expect(r.marginR).toBe(230);
    expect(r.marginV).toBe(216); // 20% x 1080
  });

  test("font proporsional thd short-side (720x1280 → 36px & margin ikut)", () => {
    const r = computeSubtitleStyle({ outW: 720, outH: 1280, platform: "tiktok" });
    expect(r.fontSize).toBe(36);   // 54 x 720/1080
    expect(r.marginL).toBe(115);   // 16% x 720
    expect(r.marginR).toBe(115);
    expect(r.marginV).toBe(307);   // 24% x 1280
    expect(r.outline).toBe(6);     // 16% x 36px → clamp minimum 6 px
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

  test("padding kotak diturunkan dari font & dijepit 6..18 px", () => {
    expect(computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "tiktok" }).outline).toBe(9);
    expect(computeSubtitleStyle({ outW: 720, outH: 1280, platform: "tiktok" }).outline).toBe(6);
    expect(computeSubtitleStyle({ style: { fontSize: 120 }, outW: 1080, outH: 1920 }).outline).toBe(18);
    expect(computeSubtitleStyle({ outW: 1920, outH: 1080, platform: "youtube" }).outline).toBe(9);
  });
});

describe("subtitle-style - kotak latar (BorderStyle=3) & posisi", () => {
  test("default: kotak hitam 60% pekat di OutlineColour & BackColour, teks putih", () => {
    const r = computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "tiktok" });
    expect(r.borderStyle).toBe(3);
    expect(r.outlineColour).toBe("&H66000000"); // 0x66 = 102/255 → 60% pekat
    expect(r.backColour).toBe("&H66000000");
    expect(r.shadow).toBe(0);
    expect(r.shadowColour).toBe("&HFF000000");  // transparan (shadow dimatikan)
    expect(r.primaryColour).toBe("&H00FFFFFF"); // teks TETAP putih
  });

  test("backgroundColor dipakai sebagai warna kotak", () => {
    const r = computeSubtitleStyle({
      style: { backgroundColor: "#1E3A8A" },
      outW: 1080, outH: 1920, platform: "tiktok",
    });
    expect(r.borderStyle).toBe(3);
    expect(r.outlineColour).toBe("&H668A3A1E");
    expect(r.backColour).toBe("&H668A3A1E");
  });

  test("backgroundAlpha dijepit ke rentang 55-65% pekat (alpha 0x59..0x73)", () => {
    // 150 (nilai lama = ~41% pekat, kurang terbaca) → dijepit ke 0x73 = 55%.
    expect(computeSubtitleStyle({ style: { backgroundAlpha: 150 }, outW: 1080, outH: 1920 }).outlineColour)
      .toBe("&H73000000");
    // 0 (kotak nyaris tak terlihat) → dijepit ke 0x59 = 65%.
    expect(computeSubtitleStyle({ style: { backgroundAlpha: 0 }, outW: 1080, outH: 1920 }).outlineColour)
      .toBe("&H59000000");
    // 102 = 0x66 sudah di dalam rentang → dibiarkan apa adanya.
    expect(computeSubtitleStyle({ style: { backgroundAlpha: 102 }, outW: 1080, outH: 1920 }).outlineColour)
      .toBe("&H66000000");
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
    expect(hexToAssColor("#000000", 102)).toBe("&H66000000");
  });
});

describe("buildForceStyle", () => {
  test("PlayResX/PlayResY DIDAHULUKAN + semua field kotak/padding/margin", () => {
    const r = computeSubtitleStyle({ style: { fontSize: 28 }, outW: 1080, outH: 1920, platform: "tiktok" });
    const fs = buildForceStyle(r);
    expect(fs.indexOf("PlayResX=1080,PlayResY=1920,FontName=")).toBe(0);
    expect(fs).toContain("FontSize=54");
    expect(fs).toContain("Outline=9,OutlineColour=&H66000000");
    expect(fs).toContain("Shadow=0,ShadowColour=&HFF000000");
    expect(fs).toContain("BorderStyle=3");
    expect(fs).toContain("BackColour=&H66000000");
    expect(fs).toContain("Alignment=2");
    expect(fs).toContain("MarginL=173,MarginR=173");
    expect(fs).toContain("MarginV=461");
  });

  test("PlayRes landscape mengikuti output 1920x1080", () => {
    const r = computeSubtitleStyle({ outW: 1920, outH: 1080, platform: "youtube" });
    const fs = buildForceStyle(r);
    expect(fs.indexOf("PlayResX=1920,PlayResY=1080,FontName=")).toBe(0);
    expect(fs).toContain("FontSize=56");
    expect(fs).toContain("MarginL=230,MarginR=230");
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
