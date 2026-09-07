/**
 * Subtitle Style Engine — ACS (Sesi B)
 *
 * Memusatkan seluruh keputusan gaya caption subtitle yang sebelumnya
 * tersebar & sebagian BUG:
 *
 * PROBLEM LAMA:
 *  - `subtitleStyle.fontSize` (dari UI) DIIGNOR oleh render — ukuran
 *    di-hardcode dari rumus konservatif (4% tinggi video) → caption
 *    tampil KECIL & cheesy.
 *  - `backgroundColor`/`backgroundAlpha` (box/gaya Netflix-TikTok)
 *    sudah ada di tipe tapi tidak pernah dipakai render.
 *
 * FIX:
 *  - `fontSize` pengguna DIHORMATI (dengan clamp wajar 12–96 dalam
 *    ruang PlayRes 384x288) atau default platform-aware bila tidak diisi.
 *  - Dukungan box (BorderStyle=4) + outline + shadow — full styling.
 *  - Semua dikalkulasi di sini sebagai PURE function → bisa di-unit-tested
 *    tanpa route/FFmpeg.
 *
 * RUANG NILAI (PENTING): filter `subtitles` dengan SRT membuat ASS
 * virtual ber-PlayRes 384x288. Jadi SEMUA nilai (font, outline, margin)
 * harus dalam ruang itu — bukan piksel video asli.
 */

import type { SubtitleStyle } from "@/lib/types";

export interface SubtitleStyleInput {
  /** Style dari UI/project (opsional — fallback ke default platform). */
  style?: Partial<SubtitleStyle> | null;
  /** Lebar video output (px video asli). */
  outW: number;
  /** Tinggi video output (px video asli). */
  outH: number;
  /** Platform tujuan: "tiktok" | "youtube" | "reels" | "podcast" | "shopee". */
  platform?: string;
  /** Font aktual yang tersedia dari prepareSubtitleFonts (fallback Quicksand). */
  resolvedFont?: string;
}

export interface SubtitleAssStyle {
  /** Nama font untuk ASS FontName. */
  fontName: string;
  /** Ukuran font dalam ruang PlayRes 288 (tinggi). */
  fontSize: number;
  /** Warna teks ASS (&HAABBGGRR). */
  primaryColour: string;
  /** Posisi: 2=bottom, 8=top (ASS). */
  alignment: number;
  /** Ketebalan outline (PlayRes). */
  outline: number;
  /** Warna outline ASS. */
  outlineColour: string;
  /** 1 = outline+shadow, 3 = box opaque, 4 = box + outline. */
  borderStyle: number;
  /** Warna kotak/subtle (ASS dengan alpha). */
  backColour: string;
  /** Shadow dalam angka. */
  shadow: number;
  /** Warna shadow ASS. */
  shadowColour: string;
  /** Margin kiri/kanan (PlayRes). */
  marginL: number;
  marginR: number;
  /** Margin vertikal (PlayRes). */
  marginV: number;
}

/** Default font size per layout (dalam PlayRes height 288): TikTok besar, YouTube moderat. */
const DEFAULT_FONT_PORTRAIT = 30;  // ~10.4% tinggi
const DEFAULT_FONT_LANDSCAPE = 24; // ~8.3% tinggi
const DEFAULT_FONT_SQUARE = 26;    // ~9.0% tinggi

const MIN_FONT = 12;
const MAX_FONT = 96;

/** Konversi hex "#RRGGBB" → ASS "&HAABBGGRR". Alpha 0-255 (255 = opaque). */
export function hexToAssColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return "&H00FFFFFF";
  const r = m[1].slice(0, 2);
  const g = m[1].slice(2, 4);
  const b = m[1].slice(4, 6);
  const a = Math.max(0, Math.min(255, Math.round(alpha)))
    .toString(16)
    .padStart(2, "0");
  return `&H${a}${b}${g}${r}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Hitung seluruh parameter ASS untuk caption subtitle berdasarkan
 * style pengguna + resolusi + platform. Pure & testable.
 */
export function computeSubtitleStyle(input: SubtitleStyleInput): SubtitleAssStyle {
  const { style, outW, outH, platform, resolvedFont } = input;
  const scaleX = 384 / Math.max(1, outW);
  const scaleY = 288 / Math.max(1, outH);

  // ===== FONT SIZE =====
  // Jika style.fontSize diisi (angka valid) → hormati (PlayRes).
  // Jika tidak → default platform-aware (gaya TikTok besar).
  let fontSize: number;
  const userSize = Number(style?.fontSize);
  if (Number.isFinite(userSize) && userSize > 0) {
    fontSize = clamp(Math.round(userSize), MIN_FONT, MAX_FONT);
  } else {
    const isSquare = outW === outH;
    const isHorizontal = outW > outH;
    fontSize = isSquare
      ? DEFAULT_FONT_SQUARE
      : isHorizontal
        ? DEFAULT_FONT_LANDSCAPE
        : DEFAULT_FONT_PORTRAIT;
    if (platform === "youtube") fontSize = DEFAULT_FONT_LANDSCAPE;
  }

  // ===== WARNA =====
  const primaryColour = hexToAssColor(style?.color || "#FFFFFF");
  const outlineColour = hexToAssColor(style?.strokeColor || "#000000");
  const outline = clamp(Math.round(style?.strokeWidth ?? 3), 2, 6);

  // ===== BOX STYLE (Netflix/TikTok) =====
  const hasBox = !!style?.backgroundColor;
  const borderStyle = hasBox ? 4 : 1; // 4=box+outline, 1=outline+shadow saja
  const boxAlpha = clamp(style?.backgroundAlpha ?? 150, 0, 255);
  const backColour = hasBox
    ? hexToAssColor(style!.backgroundColor!, boxAlpha)
    : "&H00000000"; // transparan tak terpakai saat BorderStyle=1

  // ===== POSISI =====
  const alignment = style?.position === "top" ? 8 : 2;

  // ===== MARGIN (PlayRes) =====
  const sideMargin = Math.max(2, Math.round(outW * 0.08 * scaleX));
  const marginV = Math.max(2, Math.round(outH * 0.06 * scaleY));

  return {
    fontName: resolvedFont || "Quicksand",
    fontSize,
    primaryColour,
    alignment,
    outline,
    outlineColour,
    borderStyle,
    backColour,
    shadow: 1,
    shadowColour: "&H99000000",
    marginL: sideMargin,
    marginR: sideMargin,
    marginV,
  };
}

/** Bangun string `force_style` dari hasil kalkulasi (untuk filter libass). */
export function buildForceStyle(ass: SubtitleAssStyle): string {
  return [
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