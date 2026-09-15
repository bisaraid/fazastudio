/**
 * Sinyal perilaku user — FIRE-AND-FORGET dari sisi client.
 *
 * Saat tombol aksi (mis. "Ulangi Script") diklik, call ini mencatat behavior.
 * - Tidak di-await secara wajib; tidak akan menghentikan/memperlambat proses.
 * - Gagal/hilang → silent (log console saja), user tidak perlu tahu.
 */

export type BehaviorEventType =
  | "regen_script"
  | "regen_audio"
  | "lanjut_script_langsung"
  | "ganti_durasi"
  | "ganti_platform";


/**
 * Catat event perilaku. Selalu kembalikan (void) — tidak pernah throw.
 * Caller (UI) boleh memanggil tanpa menunggu.
 *
 * `value` opsional — bagan bilah nilai aktual (provider, duration, platform,
 * speed, emotion, dst). Hanya dikirim ke route bila non-kosong; route menyimpan
 * ke kolom `behavior_events.value` (jsonb). Retro-compat: caller lama tetap valid.
 */
export function recordBehavior(
  eventType: BehaviorEventType,
  projectId: string,
  value?: Record<string, unknown>
): void {
  // Kemungkinan error requests tidak boleh bocor ke caller.
  try {
    const ctrl = new AbortController();
    // Timeout pendek supaya tidak menggantung; tetap fire-and-forget.
    const t = setTimeout(() => ctrl.abort(), 1500);

    const payload: Record<string, unknown> = { eventType, projectId };
    if (value && typeof value === "object" && Object.keys(value).length > 0) {
      payload.value = value;
    }

    fetch("/api/behavior", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      keepalive: true,
    })
      .catch(() => {
        // swallow — tidak boleh memengaruhi user/generate.
      })
      .finally(() => clearTimeout(t));
  } catch {
    // swallow seluruhnya.
  }
}