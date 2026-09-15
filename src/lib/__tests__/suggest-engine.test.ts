import { test, expect, describe, vi } from "vitest";
import {
  getUserTopNichesFromGenres,
  pickSuggestSignal,
  signalToSource,
  buildPersonalizedSuggest,
  SuggestDeps,
} from "@/lib/suggest-engine";
import { BehaviorSignals } from "@/lib/persona";
import { TrendIdeaItem } from "@/lib/trend-engine";

function idea(keyword: string, score = 80): TrendIdeaItem {
  return {
    keyword,
    niche_slug: "edukasi",
    score,
    source: "youtube",
    velocity: 10,
    trend_direction: "up",
  };
}

describe("getUserTopNichesFromGenres", () => {
  const now = Date.now();
  const recent = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();

  test("genres ambigu (affiliate) di-skip; andalkan profile niche", () => {
    const genres = [
      { genre: "affiliate", created_at: recent(1) },
      { genre: "affiliate", created_at: recent(2) },
    ];
    expect(getUserTopNichesFromGenres(genres, "skincare")).toEqual(["skincare"]);
  });

  test("primary profile diletakkan paling depan, lalu kandidat by recency", () => {
    const genres = [
      { genre: "sejarah", created_at: recent(1) },
      { genre: "horor", created_at: recent(1) },
      { genre: "sejarah", created_at: recent(2) },
      { genre: "keuangan", created_at: recent(1) },
    ];
    const niches = getUserTopNichesFromGenres(genres, "edukasi");
    expect(niches[0]).toBe("edukasi");
    // sejarah muncul 2x → kandidat teratas setelah primary.
    expect(niches.slice(1)).toContain("sejarah");
    expect(niches).toContain("mistis");
  });

  test("project di luar jendela 90 hari diabaikan", () => {
    const genres = [{ genre: "sejarah", created_at: recent(120) }];
    expect(getUserTopNichesFromGenres(genres, "edukasi")).toEqual(["edukasi"]);
  });
});

describe("pickSuggestSignal", () => {
  test("fatigue (regen ≥ 3 & ≥ 2×lanjut) → upcoming", () => {
    const b: BehaviorSignals = { regen: 4, lanjut: 1, preferences: {} };
    expect(pickSuggestSignal(b)).toBe("upcoming");
  });

  test("regen < 3 → now", () => {
    expect(pickSuggestSignal({ regen: 2, lanjut: 2, preferences: {} })).toBe("now");
  });

  test("lanjut dominan → now", () => {
    expect(pickSuggestSignal({ regen: 3, lanjut: 4, preferences: {} })).toBe("now");
  });
});

describe("signalToSource", () => {
  test("upcoming → youtube_us; now → youtube", () => {
    expect(signalToSource("upcoming")).toBe("youtube_us");
    expect(signalToSource("now")).toBe("youtube");
  });
});

describe("buildPersonalizedSuggest", () => {
  function makeDeps(overrides?: Partial<SuggestDeps>): SuggestDeps {
    return {
      loadProfileNiche: vi.fn().mockResolvedValue("edukasi"),
      loadProjectGenres: vi.fn().mockResolvedValue([]),
      loadBehavior: vi.fn().mockResolvedValue({ regen: 1, lanjut: 3, preferences: { provider: "google", duration: 30, platform: "tiktok" } } as BehaviorSignals),
      loadTrendingNow: vi.fn().mockResolvedValue([idea("topik A"), idea("topik B")]),
      loadAkanTrending: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
  }

  test("fallback global bila tidak ada profil (personalized=false, source=global)", async () => {
    const deps = makeDeps({ loadProfileNiche: vi.fn().mockResolvedValue(null) });
    const res = await buildPersonalizedSuggest(deps, 5);
    expect(res.personalized).toBe(false);
    expect(res.source).toBe("global");
    expect(res.signal).toBe("now");
    expect(deps.loadTrendingNow).toHaveBeenCalledWith("");
    expect(res.ideas.length).toBe(2);
  });

  test("profil normal → signal now, ambil trend niche, preferensi sebagai metadata", async () => {
    const deps = makeDeps();
    const res = await buildPersonalizedSuggest(deps, 5);
    expect(res.personalized).toBe(true);
    expect(res.signal).toBe("now");
    expect(res.source).toBe("youtube");
    expect(deps.loadTrendingNow).toHaveBeenCalledWith("edukasi");
    expect(res.ideas[0].preferences).toEqual({ provider: "google", duration: 30, platform: "tiktok" });
    // Metadata tidak mengubah urutan: keyword tetap sesuai score order dari loader.
    expect(res.ideas.map((i) => i.keyword)).toEqual(["topik A", "topik B"]);
  });

  test("fatigue → signal upcoming, ambil akan-trending niche", async () => {
    const deps = makeDeps({
      loadBehavior: vi.fn().mockResolvedValue({ regen: 4, lanjut: 1, preferences: {} } as BehaviorSignals),
      loadAkanTrending: vi.fn().mockResolvedValue([idea("US A", 90)]),
    });
    const res = await buildPersonalizedSuggest(deps, 5);
    expect(res.signal).toBe("upcoming");
    expect(res.source).toBe("youtube_us");
    expect(deps.loadAkanTrending).toHaveBeenCalledWith("edukasi");
  });

  test("niche kosong → fallback global pada sinyal yang sama", async () => {
    const deps = makeDeps({
      loadBehavior: vi.fn().mockResolvedValue({ regen: 4, lanjut: 1, preferences: {} } as BehaviorSignals),
      // Niche "edukasi" kosong; global ("") punya data → fallback ke youtube_us global.
      loadAkanTrending: vi.fn().mockImplementation((niche: string) =>
        niche === "" ? Promise.resolve([idea("US global", 70)]) : Promise.resolve([])
      ),
    });
    const res = await buildPersonalizedSuggest(deps, 5);
    expect(res.source).toBe("global");
    expect(res.ideas.map((i) => i.keyword)).toEqual(["US global"]);
    // fallback global pada sinyal yang sama (upcoming) → loadAkanTrending("").
    expect(deps.loadAkanTrending).toHaveBeenCalledWith("");
  });
});