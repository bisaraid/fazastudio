/**
 * YouTube Data API v3 Client — Faza Studio
 *
 * Mengambil video trending Indonesia per kategori (niche).
 * Data: judul, views, likes, upload date, channel.
 *
 * API: https://www.googleapis.com/youtube/v3/videos
 * Endpoint: chart=mostPopular, regionCode=ID, videoCategoryId={catId}
 */

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/** Mapping niche → YouTube Category ID */
export const NICHE_TO_YT_CATEGORY: Record<string, number | null> = {
  // Jualan
  skincare: 26,        // Howto & Style
  fashion: 26,         // Howto & Style
  gadget: 28,          // Science & Technology
  makanan: 22,         // People & Blogs
  suplemen: 22,        // People & Blogs
  perabot: 22,         // People & Blogs
  // Konten
  mistis: 24,          // Entertainment
  motivasi: 22,        // People & Blogs
  edukasi: 27,         // Education
  keuangan: 27,        // Education
  curhat: 22,          // People & Blogs
  sejarah: 27,         // Education
};

export interface YouTubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  likeCount: number;
  publishedAt: string; // ISO string
}

export interface FetchTrendingResult {
  success: boolean;
  data: YouTubeVideo[];
  error?: string;
}

/**
 * Fetch video trending Indonesia per kategori YouTube.
 * @param categoryId — YouTube category ID (22, 24, 26, 27, 28)
 * @param maxResults — jumlah hasil (max 50)
 */
export async function fetchYouTubeTrending(
  categoryId: number,
  maxResults: number = 10
): Promise<FetchTrendingResult> {
  if (!YOUTUBE_API_KEY) {
    return { success: false, data: [], error: "YOUTUBE_API_KEY tidak tersedia" };
  }

  const params = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    chart: "mostPopular",
    regionCode: "ID",
    videoCategoryId: categoryId.toString(),
    maxResults: Math.min(maxResults, 50).toString(),
    key: YOUTUBE_API_KEY,
  });

  try {
    const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`, {
      next: { revalidate: 3600 }, // cache 1 jam di server
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[trend-youtube] API error ${res.status}:`, errText.slice(0, 200));
      return { success: false, data: [], error: `YouTube API error: ${res.status}` };
    }

    const json = await res.json();
    const items = json.items ?? [];

    const videos: YouTubeVideo[] = items.map((item: any) => ({
      videoId: item.id,
      title: item.snippet?.title ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      viewCount: parseInt(item.statistics?.viewCount ?? "0", 10),
      likeCount: parseInt(item.statistics?.likeCount ?? "0", 10),
      publishedAt: item.snippet?.publishedAt ?? "",
    }));

    return { success: true, data: videos };
  } catch (e) {
    console.error("[trend-youtube] fetch error:", (e as Error).message);
    return { success: false, data: [], error: (e as Error).message };
  }
}

/**
 * Fetch trending per niche — wrapper yang handle mapping kategori.
 * Kalau niche tidak punya kategori spesifik, return empty (pakai fallback).
 */
export async function fetchTrendingByNiche(
  niche: string,
  maxResults: number = 10
): Promise<FetchTrendingResult> {
  const categoryId = NICHE_TO_YT_CATEGORY[niche];
  if (!categoryId) {
    return { success: false, data: [], error: `Niche "${niche}" tidak punya mapping kategori YouTube` };
  }
  return fetchYouTubeTrending(categoryId, maxResults);
}
