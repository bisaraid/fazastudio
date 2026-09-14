/**
 * Subtitle Style Engine — worker (salinan dari src/lib/subtitle-style.ts)
 * Memusatkan keputusan gaya caption subtitle. Pure & testable.
 * Ruang nilai ASS PlayRes 384x288.
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
  fontName: string;
  fontSize: number;
  primaryColour: string;
  alignment: number;
  outline: number;
  outlineColour: string;
  borderStyle: number;
  backColour: string;
  shadow: number;
  shadowColour: string;
  marginL: number;
  marginR: number;
  marginV: number;
}

const DEFAULT_FONT_PORTRAIT = 30;
const DEFAULT_FONT_LANDSCAPE = 24;
const DEFAULT_FONT_SQUARE = 26;
const MIN_FONT = 12;
const MAX_FONT = 96;

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

export function computeSubtitleStyle(input: SubtitleStyleInput): SubtitleAssStyle {
  const { style, outW, outH, platform, resolvedFont } = input;
  const scaleX = 384 / Math.max(1, outW);
  const scaleY = 288 / Math.max(1, outH);

  let fontSize: number;
  const userSize = Number(style?.fontSize);
  if (Number.isFinite(userSize) && userSize > 0) {
    fontSize = clamp(Math.round(userSize), MIN_FONT, MAX_FONT);
  } else {
    const isSquare = outW === outH;
    const isHorizontal = outW > outH;
    fontSize = isSquare ? DEFAULT_FONT_SQUARE : isHorizontal ? DEFAULT_FONT_LANDSCAPE : DEFAULT_FONT_PORTRAIT;
    if (platform === "youtube") fontSize = DEFAULT_FONT_LANDSCAPE;
  }

  const primaryColour = hexToAssColor(style?.color || "#FFFFFF");
  const outlineColour = hexToAssColor(style?.strokeColor || "#000000");
  const outline = clamp(Math.round(style?.strokeWidth ?? 3), 2, 6);

  const hasBox = !!style?.backgroundColor;
  const borderStyle = hasBox ? 4 : 1;
  const boxAlpha = clamp(style?.backgroundAlpha ?? 150, 0, 255);
  const backColour = hasBox ? hexToAssColor(style!.backgroundColor!, boxAlpha) : "&H00000000";

  const alignment = style?.position === "top" ? 8 : 2;
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
