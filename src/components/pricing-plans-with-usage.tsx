"use client";
import { useUsage } from "@/hooks/useUsage";
import { PricingPlans } from "@/components/pricing-plans";
import type { Plan } from "@/lib/types";

interface PricingPlansWithUsageProps {
  /** Diteruskan ke PricingPlans (landing memakai showComparison=false). */
  showComparison?: boolean;
  showCta?: boolean;
}

export function PricingPlansWithUsage({
  showComparison,
  showCta,
}: PricingPlansWithUsageProps) {
  const { plan, loading } = useUsage();
  const currentPlan = plan ? (plan as Plan["id"]) : undefined;
  return (
    <PricingPlans
      currentPlan={loading ? undefined : currentPlan}
      showComparison={showComparison}
      showCta={showCta}
    />
  );
}
