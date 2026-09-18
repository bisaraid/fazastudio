"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANS } from "@/lib/constants";
import type { Plan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Check, Minus, ChevronDown } from "lucide-react";

interface PricingPlansProps {
  /** Plan yang sedang aktif user (untuk halaman pengaturan). Opsional di /harga. */
  currentPlan?: Plan["id"];
  /** Tautan saat user memilih plan gratis / belum berlangganan. Default ke /daftar. */
  ctaHref?: string;
}

type Cell = string | boolean;

type SectionRow = {
  label: string;
  cell: (m: Plan["matrix"]) => Cell;
};

const SECTIONS: { title: string; rows: SectionRow[] }[] = [
  {
    title: "AUDIO",
    rows: [
      { label: "Kualitas Suara", cell: (m) => m.audio.quality },
      { label: "Pilihan Suara", cell: (m) => m.audio.voices },
    ],
  },
  {
    title: "SCRIPT",
    rows: [
      { label: "Generate Script", cell: (m) => m.script.generate },
      { label: "Regenerasi Script", cell: (m) => m.script.regen },
    ],
  },
  {
    title: "SUBTITLE",
    rows: [
      { label: "Auto Subtitle", cell: (m) => m.subtitle.auto },
      { label: "Gaya Subtitle", cell: (m) => m.subtitle.styles },
      { label: "Posisi Subtitle", cell: (m) => m.subtitle.position },
      { label: "Export SRT/VTT", cell: (m) => m.subtitle.exportSrt },
    ],
  },
  {
    title: "VIDEO",
    rows: [
      { label: "Kualitas Render", cell: (m) => m.video.quality },
      { label: "Background Footage", cell: (m) => m.video.footage },
      { label: "Template Visual", cell: (m) => m.video.templates },
      { label: "Rasio Video", cell: (m) => m.video.ratio },
    ],
  },
  {
    title: "LAINNYA",
    rows: [{ label: "Histori Project", cell: (m) => m.other.history }],
  },
];

function CellContent({ value }: { value: Cell }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="h-4 w-4 text-emerald-500" />
    ) : (
      <Minus className="h-4 w-4 text-muted-foreground/40" />
    );
  }
  return <span>{value}</span>;
}
/** Daftar plan reusable — dipakai di /harga (publik) dan /pengaturan. */
export function PricingPlans({ currentPlan, ctaHref = "/daftar" }: PricingPlansProps) {
  const [compareOpen, setCompareOpen] = useState(false);

  return (
    <div>
      {/* ==== Kartu plan ==== */}
      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col gap-6 rounded-2xl border border-primary/20 bg-primary/10 p-6 transition-all duration-300 ease-out sm:p-8 ${
                plan.highlighted
                  ? "-translate-y-1 border-2 border-primary/60 shadow-[0_0_30px_-5px] shadow-primary/30 hover:-translate-y-2 hover:shadow-lg"
                  : "hover:-translate-y-1 hover:shadow-lg"
              }`}
            >
              {plan.highlighted && (
                <span className="shimmer-sweep mx-auto inline-block w-max rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  ⭐ Paling Populer
                </span>
              )}
              <div className="space-y-3">
                <h3 className="text-lg font-bold tracking-tight">{plan.label_id}</h3>
                <p className="text-sm text-muted-foreground">{plan.tagline}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">
                  {plan.price === 0 ? "Rp 0" : `Rp ${plan.price.toLocaleString("id-ID")}`}
                </span>
                {plan.price !== 0 && (
                  <span className="text-sm font-medium text-muted-foreground">/bln</span>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-3">
                {plan.features.slice(0, 5).map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-4">
                {isCurrent ? (
                  <Button className="w-full" variant="secondary" disabled>
                    Aktif
                  </Button>
                ) : plan.price === 0 ? (
                  <Link href={ctaHref} className="block">
                    <Button className="w-full" variant="outline">
                      {plan.cta || "Mulai Gratis"}
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/api/checkout?plan=${plan.id}`} className="block">
                    <Button className="w-full" variant={plan.highlighted ? "default" : "outline"}>
                      {plan.cta || "Mulai Sekarang"}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ==== Accordion bandingkan fitur (default tertutup) ==== */}
      <div className="mt-10 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setCompareOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          Bandingkan semua fitur
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-300 ${
              compareOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {compareOpen && (
          <div className="mt-6 w-full max-w-4xl overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="w-44 p-3 align-bottom text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Fitur
                  </th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.id}
                      className={`p-3 align-bottom ${
                        plan.highlighted ? "bg-primary/5" : ""
                      } ${currentPlan === plan.id ? "ring-1 ring-inset ring-primary" : ""}`}
                    >
                      <div className="flex flex-col gap-1.5">
                        <span className="text-lg font-bold">{plan.label_id}</span>
                        <span className="text-xs text-muted-foreground">{plan.tagline}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((section) => (
                  <GroupRow key={section.title} title={section.title} rows={section.rows} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Render satu section header + baris-baris fiturnya. */
function GroupRow({ title, rows }: { title: string; rows: SectionRow[] }) {
  return (
    <>
      <tr className="border-t-2 border-border bg-muted/30">
        <td colSpan={4} className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.label} className="border-t border-border">
          <td className="p-3 text-muted-foreground">{row.label}</td>
          {PLANS.map((plan) => (
            <td key={plan.id} className={`p-3 ${plan.highlighted ? "bg-primary/[0.03]" : ""}`}>
              <CellContent value={row.cell(plan.matrix)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}