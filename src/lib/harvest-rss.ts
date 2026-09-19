/**
 * RSS Harvester - Faza Studio
 *
 * Haal RSS feeds op van relevante Indonesische media en extraheer judul artikel.
 * Best-effort: faalt een feed - skip, ga door met de rest.
 */

const DETIK_FEEDS = [
  "https://rss.detik.com/index.php/detikhealth",
  "https://rss.detik.com/index.php/detikfood",
  "https://rss.detik.com/index.php/detikinet",
  "https://rss.detik.com/index.php/detikfinance",
  "https://rss.detik.com/index.php/detikhot",
  "https://rss.detik.com/index.php/detikstyle",
];

const KOMPAS_FEEDS = [
  "https://rss.kompas.com/mostpopular",
  "https://rss.kompas.com/techno",
  "https://rss.kompas.com/ekonomi",
  "https://rss.kompas.com/lifestyle",
  "https://rss.kompas.com/bola",
  "https://rss.kompas.com/viral",
];

const FEEDS = [...DETIK_FEEDS, ...KOMPAS_FEEDS];

const USER_AGENT = "Mozilla/5.0 (compatible; Fazastudio RSS)";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function extractTitles(xml: string): string[] {
  const out: string[] = [];
  const lower = xml.toLowerCase();
  let pos = 0;
  while (true) {
    const start = lower.indexOf("<item", pos);
    if (start === -1) break;
    const titlePos = xml.indexOf("<title", start);
    const close = titlePos === -1 ? -1 : xml.indexOf("</title>", titlePos);
    if (titlePos !== -1 && close !== -1) {
      const raw = xml.slice(titlePos + 7, close);
      const c = decodeEntities(raw.trim());
      if (c) out.push(c.slice(0, 200));
    }
    pos = start + 5;
  }
  return out;
}

async function fetchFeed(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/rss+xml, application/xml, text/xml",
      },
    });
    if (!res.ok) {
      console.warn("[harvest-rss] feed tidak OK:", url, res.status);
      return [];
    }
    const xml = await res.text();
    return extractTitles(xml);
  } catch (e) {
    console.error("[harvest-rss] feed gagal:", url, e);
    return [];
  }
}

/**
 * Haal judul van artikels uit meerdere Indonesische RSS feeds op (parallel).
 * Best-effort: faalt een feed - skip; resultaat is de som van succesvolle feeds.
 */
export async function fetchRssTitles(): Promise<string[]> {
  const settled = await Promise.allSettled(FEEDS.map((url) => fetchFeed(url)));
  const out: string[] = [];
  const seen = new Set();
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const t of r.value) {
      const k = t.toLowerCase();
      if (t && !seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    }
  }
  return out;
}
