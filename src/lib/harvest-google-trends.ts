import { extractTitles } from "./harvest-rss";

/**
 * Google Trends Harvester - Faza Studio
 *
 * Haal daily trending searches op voor Indonesie (geo = ID) via de RSS feed van
 * Google Trends (zonder externe library). Best-effort: bij een fout: lege array (gooit nooit).
 */

const GOOGLE_TRENDS_RSS = "https://trends.google.com/trends/trendingsearches/daily/rss?geo=ID";
const USER_AGENT = "Mozilla/5.0 (compatible; Fazastudio RSS)";

/**
 * Haal trending zoektermen op voor Indonesie via de Google Trends RSS feed.
 * Return: array van judul. Best-effort: bij fout: [] (gooit nooit).
 */
export async function fetchGoogleTrends(): Promise<string[]> {
  try {
    const res = await fetch(GOOGLE_TRENDS_RSS, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/rss+xml, application/xml, text/xml",
      },
    });
    if (!res.ok) {
      console.warn("[harvest-google-trends] feed niet OK:", res.status);
      return [];
    }
    const xml = await res.text();
    // Eerste item is steeds een header - skip.
    return extractTitles(xml, true);
  } catch (e) {
    console.error("[harvest-google-trends] fetch gagal:", e);
    return [];
  }
}
