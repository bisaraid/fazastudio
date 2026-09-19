import googleTrendsApi from "google-trends-api";

/**
 * Google Trends Harvester - Faza Studio
 *
 * Haal daily trending searches op voor Indonesie (geo = ID) via het
 * google-trends-api npm pakket. Best-effort: bij een fout: lege array (gooit nooit).
 */

const GEO = "ID";

function cleanTitle(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s.trim().slice(0, 120);
}
function dedupe(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set();
  for (const s of list) {
    const k = s.toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

/**
 * Haal trending zoektermen op voor Indonesie (daily, geo = ID).
 * Return: array van judul/trefwoorden. Best-effort: bij fout: [] (gooit nooit).
 */
export async function fetchGoogleTrends(): Promise<string[]> {
  try {
    const raw = await googleTrendsApi.dailyTrends({ geo: GEO, trendDate: new Date() });
    const data = JSON.parse(raw);
    const days = data?.default?.trendingSearchesDays ?? [];
    const titles: string[] = [];
    for (const day of days) {
      for (const item of day?.trendingSearches ?? []) {
        const t = cleanTitle(item?.title?.query);
        if (t) titles.push(t);
      }
    }
    return dedupe(titles);
  } catch {
    return [];
  }
}
