import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * GET /api/behavior/preferences
 *
 * Kembalikan preferensi agregat user dari `behavior_events` 30 hari terakhir:
 * provider paling sering, durasi rata-rata, platform paling sering — diambil dari
 * kolom `value` (jsonb). Dipakai auto-chain untuk baca preferensi dari DB (server),
 * bukan localStorage.
 *
 * Hanya untuk user login: anonim → `authenticated:false` tanpa query DB.
 * Best-effort: kegagalan apa pun → preferensi kosong, dipakai client untuk fallback.
 */

interface PrefDoc {
  provider?: string;
  duration?: number;
  platform?: string;
}

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

export async function GET(_request: NextRequest) {
  // Identifikasi user login (best-effort; anonim → authenticated:false).
  let userId: string | null = null;
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch (e) {
    console.warn("[behavior/preferences] gagal baca sesi (diabaikan):", (e as Error)?.message);
  }

  if (!userId) {
    return NextResponse.json({ success: true, authenticated: false }, { status: 200 });
  }

  const emptyPref: PrefDoc = {};
  let preferences: PrefDoc = emptyPref;

  try {
    const svc = createServiceRoleClient();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await svc
      .from("behavior_events")
      .select("value")
      .eq("user_id", userId)
      .gte("created_at", since);

    if (!error && data) {
      const providerSeen = new Map<string, number>();
      const platformSeen = new Map<string, number>();
      const durations: number[] = [];

      for (const row of data as { value?: unknown }[]) {
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

      const provider = topByCount(providerSeen);
      const platform = topByCount(platformSeen);
      const duration = durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : undefined;

      preferences = {
        ...(provider ? { provider } : {}),
        ...(platform ? { platform } : {}),
        ...(duration !== undefined ? { duration } : {}),
      };
    }
  } catch (e) {
    // Best-effort; kalau gagal → preferensi kosong (client fallback ke localStorage).
    console.error("[behavior/preferences] agregasi gagal (diabaikan):", (e as Error)?.message);
  }

  return NextResponse.json(
    { success: true, authenticated: true, preferences },
    { status: 200 }
  );
}