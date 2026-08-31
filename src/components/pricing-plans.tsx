"use client";

import Link from "next/link";
import { PLANS } from "@/lib/constants";
import type { Plan } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Zap, Users } from "lucide-react";

const ICONS: Record<Plan["id"], typeof Sparkles> = {
  free: Sparkles,
  pro: Zap,
  team: Users,
};

interface PricingPlansProps {
  /** Plan yang sedang aktif user (untuk halaman pengaturan). Opsional di /harga. */
  currentPlan?: Plan["id"];
  /** Tautan saat user memilih plan gratis / belum berlangganan. Default ke /daftar. */
  ctaHref?: string;
}

/** Daftar plan reusable — dipakai di /harga (publik) dan /pengaturan. */
export function PricingPlans({ currentPlan, ctaHref = "/daftar" }: PricingPlansProps) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {PLANS.map((plan) => {
        const isCurrent = plan.id === currentPlan;
        const Icon = ICONS[plan.id];
        return (
          <Card
            key={plan.id}
            className={`relative ${
              plan.highlighted ? "border-primary shadow-lg shadow-primary/10" : ""
            } ${isCurrent ? "ring-2 ring-primary" : ""}`}
          >
            {plan.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground">Paling Populer</Badge>
              </div>
            )}
            <CardHeader>
              <div className="mb-2 flex items-center gap-2">
                <Icon className={`h-5 w-5 ${plan.highlighted ? "text-primary" : "text-muted-foreground"}`} />
                <CardTitle className="text-lg">{plan.label_id}</CardTitle>
              </div>
              <div className="flex items-baseline gap-1">
                {plan.price === 0 ? (
                  <span className="text-3xl font-bold">Gratis</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold">Rp {plan.price.toLocaleString("id-ID")}</span>
                    <span className="text-muted-foreground">/bulan</span>
                  </>
                )}
              </div>
              <CardDescription>{plan.creditsPerMonth} kredit/bulan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <Button className="w-full" variant="secondary" disabled>
                  Aktif
                </Button>
              ) : plan.price === 0 ? (
                <Link href={ctaHref} className="block">
                  <Button className="w-full" variant="outline">
                    Mulai Gratis
                  </Button>
                </Link>
              ) : (
                <Link href="/daftar" className="block">
                  <Button className="w-full" variant={plan.highlighted ? "default" : "outline"}>
                    Berlangganan
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}