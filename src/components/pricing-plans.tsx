"use client";

import Link from "next/link";
import { PLANS } from "@/lib/constants";
import type { Plan } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Minus } from "lucide-react";

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
  return (
    <div className="overflow-x-auto">
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
                  {plan.highlighted && (
                    <Badge className="w-max bg-primary text-primary-foreground">
                      ⭐ Paling Populer
                    </Badge>
                  )}
                  <span className="text-lg font-bold">{plan.label_id}</span>
                  <span className="text-xs text-muted-foreground">{plan.tagline}</span>
                  <span className="mt-1 flex items-baseline gap-1">
                    {plan.price === 0 ? (
                      <span className="text-2xl font-bold">Rp 0</span>
                    ) : (
                      <>
                        <span className="text-2xl font-bold">
                          Rp {plan.price.toLocaleString("id-ID")}
                        </span>
                        <span className="text-xs text-muted-foreground">/bln</span>
                      </>
                    )}
                  </span>
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
        <tfoot>
          <tr>
            <td className="p-3" />
            {PLANS.map((plan) => {
              const isCurrent = plan.id === currentPlan;
              return (
                <td key={plan.id} className={`p-3 ${plan.highlighted ? "bg-primary/5" : ""}`}>
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
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
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