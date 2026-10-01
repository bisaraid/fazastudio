"use client";

/**
 * Kartu status paket & kredit — komponen BERSAMA untuk `/pengaturan`
 * (di dalam kartu "Paket & Kredit") dan `/harga` (di atas daftar plan,
 * hanya untuk user login).
 *
 * Data: `useUsage()` (endpoint `/api/usage`). Halaman yang sudah punya
 * state usage (pengaturan) bisa mengirim prop `usage` agar TIDAK ada
 * fetch ganda.
 */

import type { ReactNode } from "react";
import { useUsage, type UsageData } from "@/hooks/useUsage";
import { PLANS } from "@/lib/constants";

export interface PlanStatusData extends Partial<UsageData> {
  loading?: boolean;
  /** true jika fetch gagal — tampilkan "—", bukan angka yang menyesatkan. */
  failed?: boolean;
}

interface PlanStatusCardProps {
  /** Mode terkendeli: kirim usage milik caller (hindari fetch `/api/usage` ganda). */
  usage?: PlanStatusData;
  /** Slot aksi opsional di kanan (mis. "Kelola di Pengaturan"). */
  cta?: ReactNode;
}

/** Nama plan human-readable (free/starter/pro → label Indonesia). */
export function planStatusLabel(planId?: string): string {
  if (!planId) return "Gratis";
  return PLANS.find((p) => p.id === planId)?.label_id ?? "Gratis";
}

export function PlanStatusCard({ usage, cta }: PlanStatusCardProps) {
  const internal = useUsage();
  const u = usage ?? internal;
  const total = u.creditsTotal ?? null;
  const used = u.creditsUsed ?? 0;
  const remaining = total != null ? Math.max(0, total - used) : null;
  const pct = total && total > 0 ? Math.min(100, (used / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Paket Aktif</p>
            <p className="font-medium">
              {u.loading ? "Memuat..." : planStatusLabel(u.plan)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Kredit Terpakai</p>
            <p className="font-medium">
              {u.loading || u.failed ? "—" : `${used} / ${total ?? "—"}`}
            </p>
          </div>
        </div>
        {cta && <div className="shrink-0">{cta}</div>}
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {u.loading || u.failed
          ? "Kredit tidak dapat dimuat. Coba muat ulang."
          : remaining !== null
            ? `${remaining} kredit tersisa bulan ini.`
            : "Jumlah kredit tidak terbatas bulan ini."}
      </p>
    </div>
  );
}

export default PlanStatusCard;
