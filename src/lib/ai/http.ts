/**
 * Pembungkus `fetch` dengan timeout + pembedaan antara timeout (→ pemicu
 * fallback) dan pembatalan oleh pemanggil (→ jangan fallback, user membatalkan).
 */

import { AiProviderError, classifyAiFailure, type AiProviderName } from "./errors";

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") ||
    (!!error && typeof error === "object" && (error as { name?: string }).name === "AbortError")
  );
}

/**
 * Fetch dengan timeout. Melempar `AiProviderError` ber-alasan "timeout" atau
 * "network" (keduanya memicu fallback), atau meneruskan AbortError asli bila
 * pemanggil sendiri yang membatalkan.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  options: { provider: AiProviderName; timeoutMs: number; signal?: AbortSignal }
): Promise<Response> {
  const { provider, timeoutMs, signal } = options;
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new AiProviderError(provider, `${provider} timeout setelah ${timeoutMs}ms`, {
        ...classifyAiFailure({ kind: "timeout" }),
      });
    }
    // Dibatalkan pemanggil (mis. request dibatalkan client) → teruskan apa adanya.
    if (isAbortError(error) || signal?.aborted) throw error;

    const message = error instanceof Error ? error.message : String(error);
    throw new AiProviderError(provider, `Gagal menghubungi ${provider}: ${message}`, {
      ...classifyAiFailure({ kind: "network" }),
    });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }
}
