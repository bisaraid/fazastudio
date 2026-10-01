/**
 * Subtitle Style Engine — ACS (Sesi B + perbaikan ukuran/posisi)
 *
 * Memusatkan seluruh keputusan gaya caption subtitle (ukuran, margin, warna,
 * box) sebagai PURE function → bisa di-unit-tested tanpa route/FFmpeg.
 *
 * PERBAIKAN UKURAN (live-verified via FFmpeg 6.1.1 + libass):
 *  - Konversi SRT→ASS FFmpeg membuat script virtual ber-PlayRes 384x288.
 *    libass menskalakan SERAGAM berbasis tinggi: 1920/288 = 6,67x.
 *    Akibatnya FontSize=30 "PlayRes" → cap ~131-140px di kanvas 1080x1920
 *    (subtitle raksasa; teks panjang sampai 7 baris & meleset zona aman).
 *  - FIX: force_style kini MENYERTAKAN PlayResX/PlayResY = ukuran video →
 *    SEMUA nilai (FontSize, Outline, Margin) berarti PIKSEL NYATA di
 *    outW x outH. (Opsi `original_size=` pada filter `subtitles` TERBUKTI
 *    no-op untuk skala SRT.)
 *  - Ukuran font & margin per platform lewat `getSubtitlePlatformProfile`
 *    (~48-56 px pada lebar 1080; margin bawah 20-24% tinggi = zona aman UI
 *    platform; margin horizontal SIMETRIS (kiri = kanan, 12-16% lebar) →
 *    teks tepat di tengah frame; target max 2 baris).
 *
 * PERBAIKAN POSISI + KETERBACAAN (dari render nyata):
 *  - MASALAH 1 "teks tidak di tengah": margin kiri/kanan tidak simetris
 *    (tiktok 6% vs 16%) → libass memusatkan teks di dalam area
 *    [MarginL, W-MarginR], jadi blok teks bergeser KE KIRI. FIX: semua profil
 *    memakai margin horizontal SIMETRIS (12-16%) → teks benar-benar tengah
 *    TANPA melebar ke area tombol/rail UI kanan platform vertikal.
 *  - MASALAH 2 "teks kurang terbaca di footage cerah": teks putih tanpa latar.
 *    FIX: BorderStyle=3 (opaque box) → kotak hitam semi-transparan (60% pekat)
 *    di belakang teks. Saat BorderStyle=3, libass mengambil WARNA kotak dari
 *    OutlineColour dan PADDING kotak dari Outline (bukan garis outline lagi);
 *    BackColour = warna shadow → diisi nilai yang sama. Shadow=0 agar tepi
 *    kotak bersih.
 *
 * SINKRONISASI: worker/src/lib/subtitle-style.ts adalah SALINAN dari file ini.
 * Ubah keduanya bersama-sama.
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
  /** PlayResX = lebar video output — dipakai force_style agar satuan = piksel. */
  playResX: number;
  /** PlayResY = tinggi video output — dipakai force_style agar satuan = piksel. */
  playResY: number;
  /** Nama font untuk ASS FontName. */
  fontName: string;
  /** Ukuran font dalam PIKSEL nyata di kanvas outW x outH. */
  fontSize: number;
  /** Warna teks ASS (&HAABBGGRR). */
  primaryColour: string;
  /** Posisi: 2=bottom, 8=top (ASS). */
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
  /** Shadow dalam piksel. 0 = tanpa shadow (tepi kotak bersih). */
  shadow: number;
  /** Warna shadow ASS. */
  shadowColour: string;
  /** Margin kiri/kanan (px). */
  marginL: number;
  marginR: number;
  /** Margin vertikal bawah (px). */
  marginV: number;
}

// ============================================================
// Profil gaya subtitle per platform (fungsi murni platform → style)
// ============================================================

export interface SubtitlePlatformProfile {
  /** Ukuran font (px) pada short-side referensi 1080. */
  fontPx: number;
  /** Margin bawah sebagai FRACSI tinggi frame — zona aman UI bawah platform. */
  marginBottomPct: number;
  /** Margin kiri sebagai fraksi lebar frame. WAJIB sama dengan marginRightPct. */
  marginLeftPct: number;
  /**
   * Margin kanan sebagai fraksi lebar frame. HARUS sama dengan marginLeftPct
   * (fix "blok teks bergeser ke kiri"); 12-16% cukup lebar agar teks tidak
   * masuk area tombol/rail UI kanan platform vertikal.
   */
  marginRightPct: number;
  /**
   * Target maksimum baris (DESAIN — libass tidak punya batas runtime;
   * wrap aktual = f(font + margin)). Statis: tidak dieksekusi FFmpeg.
   */
  maxLines: number;
}

/**
 * Tabel profil per platform. MARGIN HORIZONTAL SIMETRIS (kiri == kanan) di
 * semua platform. Angka divalidasi render live 1080x1920 / 1920x1080 (lihat
 * laporan): zona bawah 20-24% tinggi TIDAK diubah, margin samping 12-16%
 * lebar agar teks tidak masuk tombol/rail UI kanan platform vertikal.
 */
const SUBTITLE_PROFILES: Record<string, SubtitlePlatformProfile> = {
  tiktok:  { fontPx: 54, marginBottomPct: 0.24, marginLeftPct: 0.16, marginRightPct: 0.16, maxLines: 2 },
  reels:   { fontPx: 52, marginBottomPct: 0.24, marginLeftPct: 0.16, marginRightPct: 0.16, maxLines: 2 },
  youtube: { fontPx: 56, marginBottomPct: 0.20, marginLeftPct: 0.12, marginRightPct: 0.12, maxLines: 2 },
  podcast: { fontPx: 48, marginBottomPct: 0.20, marginLeftPct: 0.12, marginRightPct: 0.12, maxLines: 2 },
  shopee:  { fontPx: 50, marginBottomPct: 0.22, marginLeftPct: 0.16, marginRightPct: 0.16, maxLines: 2 },
};

/** Profil aman untuk platform kosong/project lama/unknown ("shorts", dst). */
const DEFAULT_PROFILE: SubtitlePlatformProfile = SUBTITLE_PROFILES.tiktok;

/** Ambil profil subtitle untuk platform (tidak pernah melempar; fallback tiktok). */
export function getSubtitlePlatformProfile(
  platform?: string | null
): SubtitlePlatformProfile {
  if (!platform) return DEFAULT_PROFILE;
  return SUBTITLE_PROFILES[platform.toLowerCase()] ?? DEFAULT_PROFILE;
}

/** Short-side referensi profil (px). */
const REF_SHORT_SIDE = 1080;
/** Input UI di bawah ini = default LAMA (satuan PlayRes 28) → pakai profil. */
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
 * Hitung seluruh parameter ASS — SEMUA DALAM PIKSEL NYATA di outW x outH
 * (karena force_style menyertakan PlayResX/PlayResY = ukuran output).
 * Pure & testable.
 */
export function computeSubtitleStyle(input: SubtitleStyleInput): SubtitleAssStyle {
  const { style, outW, outH, platform, resolvedFont } = input;
  const profile = getSubtitlePlatformProfile(platform);

  // ===== FONT SIZE (px) =====
  // Profil platform diskalakan proporsional thd short-side (1080 = 1x).
  // Input UI >= 32 px dihormati (clamp 24..120); nilai legacy 28 (default
  // lama, satuan PlayRes) dianggap "otomatis" → pakai profil platform.
  const scale = Math.max(1, Math.min(outW, outH)) / REF_SHORT_SIDE;
  const profilePx = Math.max(MIN_FONT_PX, Math.round(profile.fontPx * scale));
  const userSize = Number(style?.fontSize);
  const fontSize =
    Number.isFinite(userSize) && userSize >= MIN_USER_FONT_PX
      ? clamp(Math.round(userSize), MIN_FONT_PX, MAX_FONT_PX)
      : profilePx;

  // ===== WARNA =====
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

  // ===== POSISI =====
  const alignment = style?.position === "top" ? 8 : 2;

  // ===== MARGIN (px — zona aman per platform, bukan lagi ruang PlayRes) =====
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
 * Bangun string `force_style` (untuk filter libass).
 * PlayResX/PlayResY DIDAHULUKAN agar override skala terbaca lebih dulu —
 * semua nilai berikutnya berarti piksel nyata di kanvas output.
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