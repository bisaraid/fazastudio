/**
 * Unit test MURNI untuk `subtitle-style.ts` (worker/src/lib/subtitle-style.ts).
 *
 * Kenapa `node:test` (bukan vitest):
 * - Worker tidak punya setup test sendiri → runner BAWAAN Node, nol dependency baru.
 * - Nama `*.node-test.ts` (bukan `*.test.ts`) agar TIDAK terambil vitest root.
 * - File di LUAR `worker/src` sehingga `npm run build` tidak mengompilasinya.
 *
 * Cara menjalankan (dari folder `worker/`):
 *   npx ts-node __tests__/subtitle-style.node-test.ts
 *
 * Yang diuji (pure, tanpa ffmpeg):
 * 1. Tabel profil platform + fallback aman (kosong/legacy/unknown).
 * 2. Spek: font 48-60px @1080, margin bawah 20-25% tinggi, maks 2 baris.
 * 3. PlayResX/PlayResY = ukuran output — kunci fix skala libass (6,67x).
 * 4. Margin = PIKSEL nyata (zona aman platform), bukan ruang PlayRes.
 * 5. Font proporsional thd short-side + clamp + input legacy 28.
 * 6. `buildForceStyle` menempatkan PlayResX/PlayResY paling depan.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  computeSubtitleStyle,
  buildForceStyle,
  getSubtitlePlatformProfile,
  hexToAssColor,
} from "../src/lib/subtitle-style";

test("profil: tabel per platform sesuai spek", () => {
  assert.deepEqual(getSubtitlePlatformProfile("tiktok"), {
    fontPx: 54, marginBottomPct: 0.24, marginLeftPct: 0.06, marginRightPct: 0.16, maxLines: 2,
  });
  assert.deepEqual(getSubtitlePlatformProfile("reels"), {
    fontPx: 52, marginBottomPct: 0.24, marginLeftPct: 0.06, marginRightPct: 0.18, maxLines: 2,
  });
  assert.deepEqual(getSubtitlePlatformProfile("youtube"), {
    fontPx: 56, marginBottomPct: 0.20, marginLeftPct: 0.04, marginRightPct: 0.04, maxLines: 2,
  });
  assert.deepEqual(getSubtitlePlatformProfile("podcast"), {
    fontPx: 48, marginBottomPct: 0.20, marginLeftPct: 0.08, marginRightPct: 0.08, maxLines: 2,
  });
  assert.deepEqual(getSubtitlePlatformProfile("shopee"), {
    fontPx: 50, marginBottomPct: 0.22, marginLeftPct: 0.06, marginRightPct: 0.18, maxLines: 2,
  });
});

test("profil: fallback aman tiktok untuk kosong/legacy/unknown", () => {
  const tiktok = getSubtitlePlatformProfile("tiktok");
  assert.deepEqual(getSubtitlePlatformProfile(undefined), tiktok);
  assert.deepEqual(getSubtitlePlatformProfile(null), tiktok);
  assert.deepEqual(getSubtitlePlatformProfile(""), tiktok);
  assert.deepEqual(getSubtitlePlatformProfile("shorts"), tiktok);
  assert.deepEqual(getSubtitlePlatformProfile("TiKtOk"), tiktok);
});

test("profil: seluruh platform memenuhi rentang spek", () => {
  for (const p of ["tiktok", "reels", "youtube", "podcast", "shopee"]) {
    const prof = getSubtitlePlatformProfile(p);
    assert.ok(prof.fontPx >= 48 && prof.fontPx <= 60, `${p}: font ${prof.fontPx}`);
    assert.ok(prof.marginBottomPct >= 0.2 && prof.marginBottomPct <= 0.25, `${p}: bottom`);
    assert.equal(prof.maxLines, 2, `${p}: maxLines`);
    assert.ok(prof.marginLeftPct >= 0.04 && prof.marginLeftPct <= 0.35, `${p}: left`);
    assert.ok(prof.marginRightPct >= 0.04 && prof.marginRightPct <= 0.35, `${p}: right`);
  }
});

test("compute: PlayRes = ukuran output (kunci fix skala libass)", () => {
  const portrait = computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "tiktok" });
  assert.equal(portrait.playResX, 1080);
  assert.equal(portrait.playResY, 1920);
  const landscape = computeSubtitleStyle({ outW: 1920, outH: 1080, platform: "youtube" });
  assert.equal(landscape.playResX, 1920);
  assert.equal(landscape.playResY, 1080);
});

test("compute: tiktok portrait → font & margin px nyata", () => {
  const r = computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "tiktok" });
  assert.equal(r.fontSize, 54);
  assert.equal(r.marginL, 65);   // 6% x 1080
  assert.equal(r.marginR, 173);  // 16% x 1080 (rail UI kanan)
  assert.equal(r.marginV, 461);  // 24% x 1920 (zona aman bawah)
  assert.equal(r.outline, 3);
  assert.equal(r.shadow, 2);
  assert.equal(r.alignment, 2);
  assert.equal(r.borderStyle, 1);
});

test("compute: youtube landscape → font 56px, margin simetris", () => {
  const r = computeSubtitleStyle({ outW: 1920, outH: 1080, platform: "youtube" });
  assert.equal(r.fontSize, 56);
  assert.equal(r.marginL, 77);
  assert.equal(r.marginR, 77);
  assert.equal(r.marginV, 216); // 20% x 1080
});

test("compute: font proporsional thd short-side (720x1280)", () => {
  const r = computeSubtitleStyle({ outW: 720, outH: 1280, platform: "tiktok" });
  assert.equal(r.fontSize, 36);  // 54 x 720/1080
  assert.equal(r.marginL, 43);   // 6% x 720
  assert.equal(r.marginV, 307);  // 24% x 1280
});

test("compute: input UI >= 32px dihormati, legacy 28 → profil, clamp 24..120", () => {
  assert.equal(computeSubtitleStyle({ style: { fontSize: 72 }, outW: 1080, outH: 1920 }).fontSize, 72);
  assert.equal(computeSubtitleStyle({ style: { fontSize: 28 }, outW: 1080, outH: 1920, platform: "tiktok" }).fontSize, 54);
  assert.equal(computeSubtitleStyle({ style: { fontSize: 28 }, outW: 1920, outH: 1080, platform: "youtube" }).fontSize, 56);
  assert.equal(computeSubtitleStyle({ style: { fontSize: 500 }, outW: 1080, outH: 1920 }).fontSize, 120);
  assert.equal(computeSubtitleStyle({ style: { fontSize: 31 }, outW: 1080, outH: 1920, platform: "shopee" }).fontSize, 50);
});

test("compute: box (backgroundColor) → BorderStyle 4 + BackColour alpha", () => {
  const r = computeSubtitleStyle({
    style: { backgroundColor: "#000000", backgroundAlpha: 150 },
    outW: 1080, outH: 1920, platform: "tiktok",
  });
  assert.equal(r.borderStyle, 4);
  assert.equal(r.backColour, "&H96000000");
});

test("compute: position top → alignment 8", () => {
  assert.equal(computeSubtitleStyle({ style: { position: "top" }, outW: 1080, outH: 1920 }).alignment, 8);
});

test("force_style: PlayResX/PlayResY paling depan + nilai px nyata", () => {
  const r = computeSubtitleStyle({ outW: 1080, outH: 1920, platform: "tiktok" });
  const fs = buildForceStyle(r);
  assert.ok(fs.startsWith("PlayResX=1080,PlayResY=1920,FontName="), fs);
  assert.ok(fs.includes("FontSize=54"), fs);
  assert.ok(fs.includes("MarginL=65,MarginR=173"), fs);
  assert.ok(fs.includes("MarginV=461"), fs);
  assert.ok(fs.includes("BorderStyle=1"), fs);
  assert.ok(fs.includes("BackColour="), fs);
  assert.ok(fs.includes("Alignment=2"), fs);
  // Regresi lama (PlayRes 384x288) tidak boleh kembali.
  assert.ok(!fs.includes("FontSize=30,"), fs);
});

test("force_style: landscape 1920x1080", () => {
  const fs = buildForceStyle(computeSubtitleStyle({ outW: 1920, outH: 1080, platform: "youtube" }));
  assert.ok(fs.startsWith("PlayResX=1920,PlayResY=1080,FontName="), fs);
  assert.ok(fs.includes("FontSize=56"), fs);
  assert.ok(fs.includes("MarginV=216"), fs);
});

test("hexToAssColor tetap BGR + alpha", () => {
  assert.equal(hexToAssColor("#FFD700"), "&H0000D7FF");
  assert.equal(hexToAssColor("#000000", 150), "&H96000000");
});
