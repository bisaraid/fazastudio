"use client";

/**
 * PostHog provider (client) — wrap de children in de posthog-js/react provider
 * en sync de identity met de Supabase session (identify/reset) zodat events
 * aan de juiste user hangen.
 */
import { PostHogProvider as BasePostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { useUser } from "@/hooks/useUser";
import { useUsage } from "@/hooks/useUsage";
import { getPostHog } from "@/lib/posthog";

/** Inner component: identify/reset op basis van auth-state. Geeft niks weer. */
function PostHogUserSync() {
  const { user } = useUser();
  const { plan, loading: usageLoading, failed: usageFailed } = useUsage();

  useEffect(() => {
    const ph = getPostHog();
    if (!ph) return;
    if (!user) {
      ph.reset();
      return;
    }
    const props: Record<string, unknown> = { email: user.email };
    // Plan pas meesturen wanneer usage geladen is (anders is "free" een leugen).
    if (!usageLoading && !usageFailed) {
      props.plan = plan;
    }
    ph.identify(user.id, props);
  }, [user?.id, user?.email, usageLoading, usageFailed, plan]);

  return null;
}

/** Wrap children in de PostHog provider (no-op wanneer niet geconfigureerd). */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const ph = getPostHog();
  if (!ph) return <>{children}</>;
  return (
    <BasePostHogProvider client={ph}>
      <PostHogUserSync />
      {children}
    </BasePostHogProvider>
  );
}