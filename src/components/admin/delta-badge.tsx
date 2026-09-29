/**
 * Chip delta% untuk stat card admin.
 *
 * Aturan tampilan (tidak pernah menampilkan NaN):
 *  - pct null + current > 0 → "Baru"  (baseline kosong, ada aktivitas baru)
 *  - pct null + current = 0 → "—"     (tidak ada data pembanding)
 *  - pct > 0                → "+12%" + panah naik   (hijau)
 *  - pct < 0                → "-8%"  + panah turun  (merah)
 *  - pct = 0                → "0%"   + garis        (netral)
 *
 * Warna bukan satu-satunya penanda: selalu ada IKON PANAH + teks bertanda
 * (+/-) + label yang dibacakan screen reader.
 */

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { DeltaMetric } from "@/lib/admin-delta";

interface DeltaBadgeProps {
  metric?: DeltaMetric | null;
  /** Nama metrik untuk aria-label, mis. "Project baru". */
  label: string;
  /** Keterangan periode untuk tooltip. */
  windowLabel?: string;
}

const CLAMP = 999;

/** Persentase bertanda; nilai ekstrem dijinakkan supaya tidak merusak layout. */
function fmtPct(pct: number): string {
  if (pct > CLAMP) return `>+${CLAMP}%`;
  if (pct < -CLAMP) return `<-${CLAMP}%`;
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export default function DeltaBadge({
  metric,
  label,
  windowLabel = "7 hari terakhir vs 7 hari sebelumnya",
}: DeltaBadgeProps) {
  const m = metric ?? null;
  const windowTxt = `${m?.current ?? 0} vs ${m?.previous ?? 0} (${windowLabel})`;

  let text: string;
  let toneClass: string;
  let Icon = Minus;
  let srText: string;

  if (!m || m.pct === null) {
    Icon = m && m.current > 0 ? ArrowUpRight : Minus;
    toneClass =
      m && m.current > 0
        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        : "bg-muted text-muted-foreground";
    text = m && m.current > 0 ? "Baru" : "—";
    srText = m && m.current > 0 ? "baru, belum ada pembanding" : "belum ada data pembanding";
  } else if (m.pct > 0) {
    Icon = ArrowUpRight;
    toneClass = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    text = fmtPct(m.pct);
    srText = "naik";
  } else if (m.pct < 0) {
    Icon = ArrowDownRight;
    toneClass = "bg-rose-500/10 text-rose-700 dark:text-rose-400";
    text = fmtPct(m.pct);
    srText = "turun";
  } else {
    Icon = Minus;
    toneClass = "bg-muted text-muted-foreground";
    text = "0%";
    srText = "tetap";
  }

  return (
    <span
      className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}
      title={`${label}: ${text} — ${windowTxt}`}
      aria-label={`${label}: ${srText} ${text}, ${windowTxt}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="tabular-nums">{text}</span>
      <span className="sr-only">{srText}</span>
    </span>
  );
}