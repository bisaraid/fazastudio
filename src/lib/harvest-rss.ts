/**
 * RSS Harvester - Faza Studio
 *
 * Haal RSS feeds op van relevante Indonesische media en extraheer judul artikel.
 * Best-effort: faalt een feed - skip, ga door met de rest.
 */

const FEEDS = [
  // Fashion, beauty, lifestyle
  "https://wolipop.detik.com/rss",
  // Hiburan, musik, seleb, curhat
  "https://hot.detik.com/rss",
  // Gadget, teknologi, game
  "https://inet.detik.com/rss",
  // Keuangan, bisnis, berita ekonomi
  "https://finance.detik.com/rss",
  // Kesehatan, skincare, suplemen, bayi
  "https://health.detik.com/rss",
  // Makanan, kuliner
  "https://food.detik.com/rss",
  // Olahraga
  "https://sport.detik.com/rss",
  // Otomotif, kendaraan
  "https://oto.detik.com/rss",
];

const USER_AGENT = "Mozilla/5.0 (compatible; Fazastudio RSS)";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
export function extractTitles(xml: string, skipFirst = false): string[] {
  const out: string[] = [];
  const lower = xml.toLowerCase();
  let pos = 0;
  let firstSkipped = false;
  while (true) {
    const start = lower.indexOf("<item", pos);
    if (start === -1) break;
    const titlePos = xml.indexOf("<title", start);
    const close = titlePos === -1 ? -1 : xml.indexOf("</title>", titlePos);
    if (titlePos !== -1 && close !== -1) {
      const raw = xml.slice(titlePos + 7, close);
      const c = decodeEntities(raw.trim());
      if (c) {
        if (skipFirst && !firstSkipped) {
          firstSkipped = true;
        } else {
          out.push(c.slice(0, 200));
        }
      }
    }
    pos = start + 5;
  }
  return out;
}

const FEED_FETCH_TIMEOUT_MS = 15000;
const FEED_CONCURRENCY = 3;

async function fetchOne(url: string): Promise<string[]> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
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
  return extractTitles(xml).slice(0, 10);
}

async function fetchFeed(url: string, attempt = 1): Promise<string[]> {
  try {
    return await fetchOne(url);
  } catch (e) {
    // Retry 1× (jeda kecil) utk menahan timeout/throttle sesaat dari sisi server.
    if (attempt < 2) {
      console.warn(`[harvest-rss] feed timeout/error, retry ${url}...`);
      await new Promise((r) => setTimeout(r, 500));
      return fetchFeed(url, attempt + 1);
    }
    console.error("[harvest-rss] feed gagal:", url, e);
    return [];
  }
}

/**
 * Haal judul van artikels uit meerdere Indonesische RSS feeds op (parallel).
 * Best-effort: faalt een feed - skip; resultaat is de som van succesvolle feeds.
 */
export async function fetchRssTitles(): Promise<string[]> {
  // Jalankan feed dengan CONCURRENCY terbatas (hindari throttle/rate-limit server)
  // dan best-effort: feed yang gagal di-skip, hasil di-dedupe.
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (titles: string[]) => {
    for (const t of titles) {
      const k = t.toLowerCase();
      if (t && !seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    }
  };

  const queue = FEEDS.map((url) => () => fetchFeed(url).then((rows) => add(rows)));
  const workers = Array.from(
    { length: Math.min(FEED_CONCURRENCY, queue.length) },
    async () => {
      while (queue.length > 0) {
        const job = queue.shift()!;
        try {
          await job();
        } catch {
          // best-effort — feed gagal total di-skip
        }
      }
    }
  );
  await Promise.all(workers);

  return out;
}
