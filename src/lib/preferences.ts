/**
 * Preferenze user per behavior — HYBRID senza vecchio localStorage-only.
 *
 * Auto-chain behavior-aware: ogni scelta dell'utente dopo il risultato
 * (rigenera audio con provider diverso, cambia durata, cambia piattaforma)
 * viene memorizzata come preferenza. L'auto-chain successiva usa il valore
 * più scelto (mode), altrimenti il default.
 *
 * Hybrid:
 *  - User login → baca preferensi dari DB via GET /api/behavior/preferences
 *    (agregasi behavior_events 30 hari terakhir, kolom `value`).
 *  - Gagal / anonim → fallback ke localStorage (legacy).
 */
export type PrefKind = "platform" | "provider" | "duration";

const STORAGE_KEY = "faza.preferences.v1";

interface PrefStore {
  platform?: string[];
  provider?: string[];
  duration?: number[];
}

function readRaw(): PrefStore {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PrefStore) : {};
  } catch {
    return {};
  }
}

function writeRaw(store: PrefStore): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage privato — ignora.
  }
}

/** Valore più scelto (mode). Ritorna undefined se nessun valore. */
function mostFrequent<T>(values: T[]): T | undefined {
  if (!values || values.length === 0) return undefined;
  const counts = new Map<T, number>();
  let best: T | undefined = undefined;
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

export interface UserPreferences {
  platform?: string;
  provider?: string;
  duration?: number;
}

/** Preferencie dari localStorage (mode per kind) — fallback. */
function localPreferences(): UserPreferences {
  const s = readRaw();
  return {
    platform: mostFrequent(s.platform ?? []),
    provider: mostFrequent(s.provider ?? []),
    duration: mostFrequent(s.duration ?? []),
  };
}

interface BehaviorPrefsResponse {
  success?: boolean;
  authenticated?: boolean;
  preferences?: {
    provider?: string;
    platform?: string;
    duration?: number;
  };
}

/**
 * Preferenze behavior — fattuale:
 *  1. Untuk user login, coba baca dari DB (fetch sampai timeout ~3s).
 *  2. Bila anonim, endpoint mengembalikan `authenticated:false` → pakai localStorage.
 *  3. Gagal/network error → fallback localStorage.
 */
export async function readPreferences(): Promise<UserPreferences> {
  const local = localPreferences();
  let res: Response;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    res = await fetch("/api/behavior/preferences", { signal: ctrl.signal });
    clearTimeout(t);
  } catch {
    // Network error / timeout → fallback localStorage.
    return local;
  }

  try {
    if (!res.ok) return local;
    const data = (await res.json()) as BehaviorPrefsResponse;
    // Anonim / bukan login → gunakan localStorage (bukan preferensi DB).
    if (data?.authenticated !== true) return local;

    const p = data.preferences;
    return {
      platform: p?.platform ?? undefined,
      provider: p?.provider ?? undefined,
      duration: typeof p?.duration === "number" ? p.duration : undefined,
    };
  } catch {
    return local;
  }
}

/** Registra una scelta behavior dell'utente (accumula + persiste su localStorage). */
export function recordPreference(kind: PrefKind, value: string | number): void {
  const s = readRaw();
  if (kind === "platform") {
    s.platform = [...(s.platform ?? []), String(value)];
  } else if (kind === "provider") {
    s.provider = [...(s.provider ?? []), String(value)];
  } else if (kind === "duration") {
    s.duration = [...(s.duration ?? []), Number(value)];
  }
  writeRaw(s);
}