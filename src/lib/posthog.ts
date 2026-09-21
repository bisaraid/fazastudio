"use client";

/**
 * PostHog product analytics — ACS (client).
 *
 * Inisialiseer een PostHog client (posthog-js) vanuit env:
 *   NEXT_PUBLIC_POSTHOG_KEY  — project API key (public, veilig om aan client te exposeren)
 *   NEXT_PUBLIC_POSTHOG_HOST — hosting (default: https://app.posthog.com of de EU variant)
 *
 * Wanneer de key niet is gezet (bv. lokale dev) is `posthog` null en zijn alle
 * helpers no-ops, zodat de rest van de app niets hoeft te weten over PostHog.
 */
import { PostHog } from "posthog-js";

const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

// Singleton — posthog-js (nieuwe kernel) gebruikt `new PostHog()` gevolgd door
// `.init(token, { api_host })`. Constructie is SSR-veilig (browser-safe).
const posthog = new PostHog();
const enabled = !!apiKey;
// init() raakt localStorage aan → alleen op de client (window) uitvoeren, zodat
// SSR niet crasht. `enabled` blijft op server ook true → provider-structuur is
// gelijk op server & client (geen hydration mismatch).
if (enabled && typeof window !== "undefined") {
  posthog.init(apiKey, { api_host: apiHost });
}

/** Geef de PostHog client (null wanneer niet geconfigureerd). */
export function getPostHog(): PostHog | null {
  return enabled ? posthog : null;
}

/** Track een event naar PostHog (no-op als niet geconfigureerd). */
export function track(event: string, properties?: Record<string, unknown>) {
  if (enabled) posthog.capture(event, properties);
}

/** Koppel een event aan een specifieke user (login). */
export function identify(id: string, properties?: Record<string, unknown>) {
  if (enabled) posthog.identify(id, properties);
}

/** Wis local user identity (logout) — voorkomt dat events fout aan vorige user hangen. */
export function resetIdentity() {
  if (enabled) posthog.reset();
}