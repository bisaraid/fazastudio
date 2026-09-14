"use client";
import { useUsage } from "@/hooks/useUsage";
import { PricingPlans } from "@/components/pricing-plans";
import type { Plan } from "@/lib/types";
export function PricingPlansWithUsage() {
  const { plan, loading } = useUsage();
  const currentPlan = plan ? (plan as Plan["id"]) : undefined;
  return (
    <PricingPlans currentPlan={loading ? undefined : currentPlan} />
  );
}
