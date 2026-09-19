/**
 * Personalized Suggest Engine — Faza Studio
 *
 * Menggabungkan dua aset menjadi suggest topik per-user:
 *  - Behavior user (habit/preferensi) → dari behavior_events + profiles.
 *  - Trend intelligence → dari trend_ideas (trending now + akan trending, ID vs US).
 *
 * Aturan (confirmed):
 *  - Niche authoritative = profile.niche_slug; projects hanya sebagai sinyal recency.
 *  - Ambang fatigue: regen ≥ 3 DAN regen ≥ 2×lanjut → bias "akan trending" (US/upcoming);
 *    selain itu → "tren sekarang" (ID/now).
 *  - Preferensi (provider/platform/durasi) hanya metadata, TIDAK mengubah ranking.
 *  - User baru/anonim (tanpa profil) → fallback ke suggest global.
 *
 * Semua bagian di-inject lewat `deps` agar murni & mudah di-test. Best-effort: tidak throw.
 */

import { BehaviorSignals, BehaviorPreferences } from "@/lib/persona";
import { TrendIdeaItem } from "@/lib/trend-engine";

export type SuggestSignal = "now" | "upcoming";

export interface SuggestIdea extends TrendIdeaItem {
  /** Preferensi user (provider/platform/durasi) — metadata saja, tidak mengubah ranking. */
  preferences?: BehaviorPreferences;
}

export interface SuggestDeps {
  /** Baca niche authoritative dari profil user (null bila user baru/anonim). */
  loadProfileNiche: () => Promise<string | null>;
  /** Genre projects user 90 hari terakhir — hanya sumber sinyal recency/konfirmasi. */
  loadProjectGenres: () => Promise<{ genre: string; created_at: string }[]>;
  /** Agregasi behavior user (regen/lanjut/preferences) 30 hari terakhir. */
  loadBehavior: () => Promise<BehaviorSignals>;
  /** Trend "sekarang" untuk niche tertentu; niche "" = global. */
  loadTrendingNow: (niche: string) => Promise<TrendIdeaItem[]>;
}

export interface SuggestResult {
  /** true bila ada profil & hasil personal; false = fallback global. */
  personalized: boolean;
  signal: SuggestSignal;
  source: string;
  niches: string[];
  ideas: SuggestIdea[];
}

const GENRE_TO_NICHE: Record<string, string> = {
  // Konten: petakan 1:1 ke niche trend (hanya bila tidak ambigu).
  horor: "mistis",
  motivasi: "motivasi",
  edukasi: "edukasi",
  keuangan: "keuangan",
  sejarah: "sejarah",
  romance: "curhat",
};

const PROJECTS_WINDOW_DAYS = 90;

/**
 * Bangun daftar niche kandidat dari genre projects (recency).
 * Jualan (affiliate) & genre ambigu di-skip — andalkan profile.niche_slug.
 * Urut: by frekuensi desc; primary profile niche diletakkan paling depan bila hadir.
 */
export function getUserTopNichesFromGenres(
  genres: { genre: string; created_at: string }[],
  profileNiche: string | null
): string[] {
  const counts = new Map<string, number>();
  const cutoff = Date.now() - PROJECTS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  for (const g of genres) {
    if (!g.genre) continue;
    // Lewati project di luar jendela recency.
    const ts = Date.parse(g.created_at);
    if (!Number.isNaN(ts) && ts < cutoff) continue;
    const niche = GENRE_TO_NICHE[g.genre];
    if (!niche) continue;
    counts.set(niche, (counts.get(niche) ?? 0) + 1);
  }
  const ranked: string[] = [];
  counts.forEach((_count, n) => ranked.push(n));
  ranked.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const out: string[] = [];
  const push = (n: string) => {
    if (n && !out.includes(n)) out.push(n);
  };
  if (profileNiche) push(profileNiche);
  for (const n of ranked) push(n);
  return out;
}

/**
 * Pilih sinyal berdasarkan pola behavior (pure, mudah di-test).
 * Fatigue (regen tinggi) → "upcoming"; normal → "now".
 */
export function pickSuggestSignal(behavior: BehaviorSignals): SuggestSignal {
  const { regen, lanjut } = behavior;
  if (regen >= 3 && regen >= lanjut * 2) return "upcoming";
  return "now";
}

/** Bangun source label dari personalisasi. */
export function signalToSource(signal: SuggestSignal): string {
  return signal === "upcoming" ? "youtube_us" : "youtube";
}
/**
 * Orchestrasi utama. Menerima deps (injectable) & konteks user.
 * - Tanpa profil → fallback global (loadTrendingNow("")).
 * - Dengan profil → pilih sinyal by behavior, ambil trend per niche.
 * - Preferensi user ditempel sebagai metadata ke tiap idea (tidak mengubah ranking).
 */
export async function buildPersonalizedSuggest(
  deps: SuggestDeps,
  limit: number
): Promise<SuggestResult> {
  const cap = Math.max(1, Math.min(limit, 20));
  try {
    // 1. Niche authoritative.
    const profileNiche = await deps.loadProfileNiche();

    // 2. Fallback global bila user baru / anonim / tanpa niche.
    if (!profileNiche) {
      const ideas = await deps.loadTrendingNow("");
      return {
        personalized: false,
        signal: "now",
        source: "global",
        niches: [],
        ideas: ideas.slice(0, cap).map((i) => ({ ...i })),
      };
    }

    // 3. Kandidat niche (recency dari projects) — primary tetap profile.
    const projectGenres = await deps.loadProjectGenres();
    const niches = getUserTopNichesFromGenres(projectGenres, profileNiche);

    // 4. Sinyal trend sekarang (multi-source).
    const behavior = await deps.loadBehavior();
    const signal = "now";

    // 5. Ambil trend untuk niche primary; kalau kosong, coba global.
    let ideas = await deps.loadTrendingNow(profileNiche);
    let usedSource = ideas?.[0]?.source ?? "youtube";
    if (!ideas || ideas.length === 0) {
      const globalIdeas = await deps.loadTrendingNow("");
      if (globalIdeas && globalIdeas.length > 0) {
        ideas = globalIdeas;
        usedSource = "global";
      }
    }

    // 6. Tempel preferensi sebagai metadata (tidak mengubah urutan/score).
    const preferences: BehaviorPreferences = behavior.preferences ?? {};
    const out: SuggestIdea[] = (ideas ?? []).slice(0, cap).map((i) => ({
      ...i,
      preferences,
    }));

    return {
      personalized: true,
      signal,
      source: usedSource,
      niches,
      ideas: out,
    };
  } catch {
    // Anti-crash: kalau apa pun gagal → fallback global.
    const ideas = await deps.loadTrendingNow("");
    return {
      personalized: false,
      signal: "now",
      source: "global",
      niches: [],
      ideas: ideas.slice(0, cap).map((i) => ({ ...i })),
    };
  }
}