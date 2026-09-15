import { categoryForNiche } from "@/lib/persona-data";
import { getCategoryConfig } from "@/lib/categories";

/**
 * Resolver persona Faza Studio (REVISI: exact-match saja).
 *
 * Semua 4 layer (mode, niche, gaya, cerita) WAJIB diisi user saat onboarding.
 * Karena itu resolvePersona hanya mencari baris EXACT sesuai kombinasi tsb.
 *
 * Fallback hanya untuk ERROR HANDLING/anti-crash (bukan alur normal):
 * - Bila Supabase tidak tersedia / query error / kombinasi tak ditemukan,
 *   kita kembalikan null → pemanggil memutuskan (generate lanjut TANPA blok
 *   persona, tidak pernah menghentikan permintaan).
 *
 * Dipanggil SERVER-SIDE (Route Handler) karena memakai service-role client.
 */

export interface PersonaInput {
  mode: string;          // 'jualan' | 'konten'
  nicheSlug: string;
  gayaKey: string;
  ceritaKey: string;
  /** ID user untuk membaca behavior_events (opsional). */
  userId?: string;
}

export interface PersonaResult {
  prompt: string;
  /** Key identitas kombinasi ter-resolve untuk debugging & logging. */
  matchedKey: string;
}

/**
 * Cari baris persona EXACT (mode + niche + gaya + cerita).
 * Mengembalikan prompt atau null (tak ditemukan / error / env tak tersedia).
 */
async function tryFetchExact(
  mode: string,
  niche: string,
  gaya: string,
  cerita: string
): Promise<string | null> {
  let supabase;
  try {
    const mod = await import("@/lib/supabase/service");
    supabase = mod.createServiceRoleClient();
  } catch (e) {
    // Supabase env tidak tersedia / client gagal dibuat → anggap tidak ada data.
    console.warn("[persona] service client tidak tersedia:", (e as Error)?.message);
    return null;
  }

  const { data, error } = await supabase
    .from("persona_prompts")
    .select("prompt")
    .eq("mode", mode)
    .eq("niche_slug", niche)
    .eq("gaya_key", gaya)
    .eq("cerita_key", cerita)
    .maybeSingle();

  if (error) {
    console.warn("[persona] tryFetchExact error:", error.message);
    return null;
  }
  return (data as { prompt?: string } | null)?.prompt ?? null;
}

export interface BehaviorPreferences {
  /** Provider paling sering dipakai dari kolom value (best-effort). */
  provider?: string;
  /** Rata-rata durasi (detik) dari kolom value. */
  duration?: number;
  /** Platform paling sering dipakai dari kolom value. */
  platform?: string;
}

export interface BehaviorSignals {
  regen: number;
  lanjut: number;
  /** Preferensi agregat dari kolom behavior_events.value (jsonb), best-effort. */
  preferences: BehaviorPreferences;
}

/**
 * Baca behavior_events user 30 hari terakhir dan hitung rasio
 * "sering regen" vs "sering lanjut langsung", plus agregasi preferensi
 * (provider terbanyak, durasi rata-rata, platform terbanyak) dari kolom `value`.
 *
 * Kembalikan { regen, lanjut, preferences } — dipakai untuk menyesuaikan output persona.
 * Best-effort: kalau error/env tak tersedia → netral.
 */
export async function readBehaviorSignals(userId?: string): Promise<BehaviorSignals> {
  const empty = () => ({ regen: 0, lanjut: 0, preferences: {} as BehaviorPreferences });
  if (!userId) return empty();

  let supabase;
  try {
    const mod = await import("@/lib/supabase/service");
    supabase = mod.createServiceRoleClient();
  } catch {
    return empty();
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await supabase
      .from("behavior_events")
      .select("event_type,value")
      .eq("user_id", userId)
      .gte("created_at", since);

    if (error || !data) return empty();

    let regen = 0;
    let lanjut = 0;
    const providerSeen = new Map<string, number>();
    const platformSeen = new Map<string, number>();
    const durations: number[] = [];
    for (const row of data as { event_type: string; value?: unknown }[]) {
      if (row.event_type === "regen_script" || row.event_type === "regen_audio") regen++;
      if (row.event_type === "lanjut_script_langsung") lanjut++;

      const v = row.value;
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const doc = v as Record<string, unknown>;
      if (typeof doc.provider === "string" && doc.provider) {
        providerSeen.set(doc.provider, (providerSeen.get(doc.provider) ?? 0) + 1);
      }
      if (typeof doc.platform === "string" && doc.platform) {
        platformSeen.set(doc.platform, (platformSeen.get(doc.platform) ?? 0) + 1);
      }
      if (typeof doc.duration === "number" && Number.isFinite(doc.duration)) {
        durations.push(doc.duration);
      }
    }
    return {
      regen,
      lanjut,
      preferences: {
        provider: topByCount(providerSeen),
        platform: topByCount(platformSeen),
        duration: durations.length ? avg(durations) : undefined,
      },
    };
  } catch {
    return empty();
  }
}

/** Ambil kunci dengan frekuensi tertinggi (mode); undefined bila kosong. */
function topByCount(map: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  map.forEach((c, k) => {
    if (c > bestCount) {
      bestCount = c;
      best = k;
    }
  });
  return best;
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Tambahkan instruksi kecil ke prompt berdasarkan sinyal perilaku user (rule-based,
 * bukan ML). Aturan sederhana:
 *  - Sering regen (rasio regen tinggi) → gaya persona ini belum nyambung →
 *    minta AI beri variasi agar lebih fresh.
 *  - Sering langsung lanjut (lanjut tinggi) → gaya persona pas → perkuat,
 *    minta AI pertahankan konsistensi.
 */
function applyBehaviorModifier(prompt: string, regen: number, lanjut: number): string {
  const total = regen + lanjut;
  if (total === 0) return prompt;

  // Rasio regenerasi tinggi → kurangi bobot persona ini (variasi).
  if (regen >= 3 && regen >= lanjut * 2) {
    return (
      prompt +
      "\n\nCATATAN ADAPTASI: Gaya di atas belum terasa pas untuk pembuatnya — coba beri variasi " +
      "pendekatan yang berbeda dari biasanya, tetap satu alur tapi dengan bukaan/lirik yang lebih fresh."
    );
  }

  // Rasio lanjut langsung tinggi → perkuat persona ini (konsisten).
  if (lanjut >= 2 && lanjut >= regen * 2) {
    return (
      prompt +
      "\n\nCATATAN ADAPTASI: Gaya ini sudah terbukti pas — pertahankan pola yang sama, " +
      "konsisten, dan jangan mengubah struktur yang sudah berhasil."
    );
  }

  return prompt;
}

/**
 * Resolve persona exact-match. Mengembalikan null bila kombinasi tidak tersedia
 * atau error — pemanggil lanjut tanpa blok persona (tidak pernah crash).
 *
 * Jika userId diberikan, prompt yang sama bisa ditambah instruksi adaptasi kecil
 * dari behavior_events (aturan ringan, bukan ML).
 */
export async function resolvePersona(input: PersonaInput): Promise<PersonaResult | null> {
  const { mode, nicheSlug, gayaKey, ceritaKey, userId } = input;
  const prompt = await tryFetchExact(mode, nicheSlug, gayaKey, ceritaKey);
  if (!prompt) return null;

  // Adaptasi berbasis perilaku (best-effort, diam-diam).
  let finalPrompt = prompt;
  if (userId) {
    const { regen, lanjut } = await readBehaviorSignals(userId);
    finalPrompt = applyBehaviorModifier(prompt, regen, lanjut);
  }

  return {
    prompt: finalPrompt,
    matchedKey: `${mode}|${nicheSlug}|${gayaKey}|${ceritaKey}`,
  };
}