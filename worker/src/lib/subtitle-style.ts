/**
 * Subtitle Style Engine — worker (salinan dari src/lib/subtitle-style.ts)
 * Memusatkan keputusan gaya caption subtitle. Pure & testable.
 *
 * PERBAIKAN UKURAN (live-verified FFmpeg 6.1.1 + libass): konversi SRT→ASS
 * membuat script virtual PlayRes 384x288 dan libass menskalakan SERAGAM
 * (1920/288 = 6,67x) → FontSize=30 menjadi cap ~131-140px (subtitle raksasa).
 * FIX: force_style menyertakan PlayResX/PlayResY = ukuran video sehingga
 * semua nilai = PIKSEL NYATA; ukuran/margin per platform lewat
 *
 * PERBAIKAN POSISI + KETERBACAAN (dari render nyata):
 *  - MASALAH 1 "teks tidak di tengah": margin kiri/kanan tidak simetris →
 *    libass memusatkan teks di dalam area [MarginL, W-MarginR] sehingga blok
 *    teks bergeser KE KIRI. FIX: margin horizontal SIMETRIS (kiri = kanan,
 *    12-16% lebar) di semua profil.
 *  - MASALAH 2 "teks kurang terbaca di footage cerah": FIX BorderStyle=3
 *    (opaque box) → kotak hitam 60% pekat di belakang teks; libass mengambil
 *    WARNA kotak dari OutlineColour dan PADDING dari Outline, BackColour
 *    (warna shadow) diisi sama, Shadow=0.
 * SINKRONISASI: jaga identik dengan src/lib/subtitle-style.ts.
 */
import type { SubtitleStyle } from "../queue";

export interface SubtitleStyleInput {
  style?: Partial<SubtitleStyle> | null;
  outW: number;
  outH: number;
  platform?: string;
  resolvedFont?: string;
}

export interface SubtitleAssStyle {
  /** PlayResX/PlayResY = ukuran video output → satuan force_style = piksel. */
  playResX: number;
  playResY: number;
  fontName: string;
  /** PIKSEL nyata di kanvas outW x outH. */
  fontSize: number;
  primaryColour: string;
  alignment: number;
  /**
   * PADDING kotak latar (px). Saat BorderStyle=3 libass memakai Outline
   * sebagai LEBAR KOTAK (bukan garis outline) → diturunkan dari ukuran font.
   */
  outline: number;
  /** Warna kotak latar ASS (&HAABBGGRR) = warna kotak saat BorderStyle=3. */
  outlineColour: string;
  /** Selalu 3 = opaque box (kotak latar semi-transparan di belakang teks). */
  borderStyle: number;
  /**
   * Warna kotak ASS (sama dengan outlineColour). Di ASS, BackColour dipakai
   * sebagai warna SHADOW saat BorderStyle=3 → diisi nilai sama agar konsisten.
   */
  backColour: string;
  /** Shadow (px). 0 = tanpa shadow (tepi kotak bersih). */
  shadow: number;
  shadowColour: string;
  /** Margin (px). */
  marginL: number;
  marginR: number;
  marginV: number;
}

// ===== Profil gaya subtitle per platform (platform → style) =====
// MARGIN HORIZONTAL SIMETRIS (kiri == kanan) di semua platform → blok teks
// tepat di tengah frame, tapi tetap 12-16% lebar agar tidak masuk area
// tombol/rail UI kanan. Margin bawah per platform TIDAK diubah.

export interface SubtitlePlatformProfile {
  /** Ukuran font (px) pada short-side referensi 1080. */
  fontPx: number;
  /** Margin bawah = fraksi tinggi frame (zona aman UI bawah). */
  marginBottomPct: number;
  /** Margin kiri = fraksi lebar frame. WAJIB sama dengan marginRightPct. */
  marginLeftPct: number;
  /**
   * Margin kanan = fraksi lebar frame. HARUS sama dengan marginLeftPct (fix
   * "blok teks bergeser ke kiri"); 12-16% cukup lebar agar teks tidak masuk
   * area tombol/rail UI kanan platform vertikal.
   */
  marginRightPct: number;
  /** Target maks baris (desain — libass tak punya batas runtime). Statis. */
  maxLines: number;
}

const SUBTITLE_PROFILES: Record<string, SubtitlePlatformProfile> = {
  tiktok:  { fontPx: 54, marginBottomPct: 0.24, marginLeftPct: 0.16, marginRightPct: 0.16, maxLines: 2 },
  reels:   { fontPx: 52, marginBottomPct: 0.24, marginLeftPct: 0.16, marginRightPct: 0.16, maxLines: 2 },
  youtube: { fontPx: 56, marginBottomPct: 0.20, marginLeftPct: 0.12, marginRightPct: 0.12, maxLines: 2 },
  podcast: { fontPx: 48, marginBottomPct: 0.20, marginLeftPct: 0.12, marginRightPct: 0.12, maxLines: 2 },
  shopee:  { fontPx: 50, marginBottomPct: 0.22, marginLeftPct: 0.16, marginRightPct: 0.16, maxLines: 2 },
};

/** Fallback aman: platform kosong / project lama / nilai tidak dikenal. */
const DEFAULT_PROFILE: SubtitlePlatformProfile = SUBTITLE_PROFILES.tiktok;

export function getSubtitlePlatformProfile(platform?: string | null): SubtitlePlatformProfile {
  if (!platform) return DEFAULT_PROFILE;
  return SUBTITLE_PROFILES[platform.toLowerCase()] ?? DEFAULT_PROFILE;
}

const REF_SHORT_SIDE = 1080;
/** Input di bawah ini = default LAMA (satuan PlayRes 28) → pakai profil. */
const MIN_USER_FONT_PX = 32;
const MIN_FONT_PX = 24;
const MAX_FONT_PX = 120;

// ===== Kotak latar teks (BorderStyle=3) =====
/** Warna kotak default (hitam) bila project/UI tidak mengirim backgroundColor. */
const BOX_COLOR_DEFAULT = "#000000";
/** Alpha kotak default: 0x66 = 102/255 → 60% PEKAT (40% transparan). */
const BOX_ALPHA_DEFAULT = 0x66;
/** Batas alpha dari input UI: 0x59 = 65% pekat, 0x73 = 55% pekat. */
const BOX_ALPHA_MIN = 0x59;
const BOX_ALPHA_MAX = 0x73;
/** Padding kotak = 16% ukuran font, dijepit 6..18 px (nilai Outline). */
const BOX_PADDING_RATIO = 0.16;
const BOX_PADDING_MIN_PX = 6;
const BOX_PADDING_MAX_PX = 18;

export function hexToAssColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return "&H00FFFFFF";
  const r = m[1].slice(0, 2);
  const g = m[1].slice(2, 4);
  const b = m[1].slice(4, 6);
  const a = Math.max(0, Math.min(255, Math.round(alpha))).toString(16).padStart(2, "0");
  return `&H${a}${b}${g}${r}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Hitung parameter ASS — semua nilai PIKSEL NYATA di outW x outH
 * (force_style membawa PlayResX/PlayResY = ukuran output). Pure & testable.
 */
export function computeSubtitleStyle(input: SubtitleStyleInput): SubtitleAssStyle {
  const { style, outW, outH, platform, resolvedFont } = input;
  const profile = getSubtitlePlatformProfile(platform);

  // Font: profil platform diskalakan thd short-side (1080 = 1x).
  // Input UI >= 32px dihormati (clamp 24..120); nilai legacy 28 → profil.
  const scale = Math.max(1, Math.min(outW, outH)) / REF_SHORT_SIDE;
  const profilePx = Math.max(MIN_FONT_PX, Math.round(profile.fontPx * scale));
  const userSize = Number(style?.fontSize);
  const fontSize =
    Number.isFinite(userSize) && userSize >= MIN_USER_FONT_PX
      ? clamp(Math.round(userSize), MIN_FONT_PX, MAX_FONT_PX)
      : profilePx;

  const primaryColour = hexToAssColor(style?.color || "#FFFFFF");
  // ===== KOTAK LATAR (BorderStyle=3 = opaque box) =====
  // libass saat BorderStyle=3: OutlineColour = WARNA kotak, Outline = PADDING
  // kotak (bukan garis outline); BackColour = warna shadow → diisi sama. Alpha
  // ASS: 00 = pekat, FF = transparan; di sini 60% pekat (0x66).
  const boxColor = style?.backgroundColor || BOX_COLOR_DEFAULT;
  const requestedAlpha = Math.round(style?.backgroundAlpha ?? BOX_ALPHA_DEFAULT);
  const boxAlpha = clamp(requestedAlpha, BOX_ALPHA_MIN, BOX_ALPHA_MAX);
  const boxColour = hexToAssColor(boxColor, boxAlpha);
  const outline = clamp(Math.round(fontSize * BOX_PADDING_RATIO), BOX_PADDING_MIN_PX, BOX_PADDING_MAX_PX);
  const borderStyle = 3;

  const alignment = style?.position === "top" ? 8 : 2;

  // Margin (px) — zona aman per platform, bukan lagi ruang PlayRes.
  const marginL = Math.round(outW * profile.marginLeftPct);
  const marginR = Math.round(outW * profile.marginRightPct);
  const marginV = Math.round(outH * profile.marginBottomPct);

  return {
    playResX: outW,
    playResY: outH,
    fontName: resolvedFont || "Quicksand",
    fontSize,
    primaryColour,
    alignment,
    outline,
    outlineColour: boxColour,
    borderStyle,
    backColour: boxColour,
    shadow: 0,
    shadowColour: "&HFF000000",
    marginL,
    marginR,
    marginV,
  };
}

/**
 * Bangun `force_style` untuk filter libass. PlayResX/PlayResY DIDAHULUKAN
 * agar override skala terbaca lebih dulu → semua nilai = piksel nyata.
 */
export function buildForceStyle(ass: SubtitleAssStyle): string {
  return [
    `PlayResX=${ass.playResX}`,
    `PlayResY=${ass.playResY}`,
    `FontName=${ass.fontName}`,
    `FontSize=${ass.fontSize}`,
    `PrimaryColour=${ass.primaryColour}`,
    `Outline=${ass.outline},OutlineColour=${ass.outlineColour}`,
    `Shadow=${ass.shadow},ShadowColour=${ass.shadowColour}`,
    `BorderStyle=${ass.borderStyle}`,
    `BackColour=${ass.backColour}`,
    `Alignment=${ass.alignment}`,
    `MarginL=${ass.marginL},MarginR=${ass.marginR}`,
    `MarginV=${ass.marginV}`,
  ].join(",");
}
