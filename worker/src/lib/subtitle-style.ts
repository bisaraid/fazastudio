/**
 * Subtitle Style Engine — worker (salinan dari src/lib/subtitle-style.ts)
 * Memusatkan keputusan gaya caption subtitle. Pure & testable.
 *
 * PERBAIKAN UKURAN (live-verified FFmpeg 6.1.1 + libass): konversi SRT→ASS
 * membuat script virtual PlayRes 384x288 dan libass menskalakan SERAGAM
 * (1920/288 = 6,67x) → FontSize=30 menjadi cap ~131-140px (subtitle raksasa).
 * FIX: force_style menyertakan PlayResX/PlayResY = ukuran video sehingga
 * semua nilai = PIKSEL NYATA; ukuran/margin per platform lewat
 * getSubtitlePlatformProfile (~48-56px @1080, margin bawah 20-24% = zona aman UI).
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
  /** Ketebalan outline (px). */
  outline: number;
  outlineColour: string;
  borderStyle: number;
  backColour: string;
  /** Shadow (px). */
  shadow: number;
  shadowColour: string;
  /** Margin (px). */
  marginL: number;
  marginR: number;
  marginV: number;
}

// ===== Profil gaya subtitle per platform (platform → style) =====

export interface SubtitlePlatformProfile {
  /** Ukuran font (px) pada short-side referensi 1080. */
  fontPx: number;
  /** Margin bawah = fraksi tinggi frame (zona aman UI bawah). */
  marginBottomPct: number;
  /** Margin kiri = fraksi lebar frame. */
  marginLeftPct: number;
  /** Margin kanan = fraksi lebar frame (rail UI platform). */
  marginRightPct: number;
  /** Target maks baris (desain — libass tak punya batas runtime). Statis. */
  maxLines: number;
}

const SUBTITLE_PROFILES: Record<string, SubtitlePlatformProfile> = {
  tiktok:  { fontPx: 54, marginBottomPct: 0.24, marginLeftPct: 0.06, marginRightPct: 0.16, maxLines: 2 },
  reels:   { fontPx: 52, marginBottomPct: 0.24, marginLeftPct: 0.06, marginRightPct: 0.18, maxLines: 2 },
  youtube: { fontPx: 56, marginBottomPct: 0.20, marginLeftPct: 0.04, marginRightPct: 0.04, maxLines: 2 },
  podcast: { fontPx: 48, marginBottomPct: 0.20, marginLeftPct: 0.08, marginRightPct: 0.08, maxLines: 2 },
  shopee:  { fontPx: 50, marginBottomPct: 0.22, marginLeftPct: 0.06, marginRightPct: 0.18, maxLines: 2 },
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
  const outlineColour = hexToAssColor(style?.strokeColor || "#000000");
  const outline = clamp(Math.round(style?.strokeWidth ?? 3), 1, 6);

  const hasBox = !!style?.backgroundColor;
  const borderStyle = hasBox ? 4 : 1;
  const boxAlpha = clamp(style?.backgroundAlpha ?? 150, 0, 255);
  const backColour = hasBox ? hexToAssColor(style!.backgroundColor!, boxAlpha) : "&H00000000";

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
    outlineColour,
    borderStyle,
    backColour,
    shadow: 2,
    shadowColour: "&H99000000",
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
