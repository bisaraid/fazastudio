import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { FootageOption } from "@/lib/types";

/**
 * POST /api/footage
 *
 * Mencari opsi footage (video stok) berdasarkan query visual yang relevan
 * dengan scene/project. Mengembalikan beberapa pilihan agar user bisa memilih.
 *
 * Body:
 * {
 *   query: string (wajib — visual prompt / keyword dari scene atau project),
 *   genre?: string (opsional — fallback keyword jika query kosong),
 *   perPage?: number (opsional, default 6)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: FootageOption[]
 * }
 */
const PEXELS_API_URL = "https://api.pexels.com/videos/search";

/** Keyword fallback per genre — dipakai jika query kosong/tidak spesifik */
const GENRE_FALLBACK_QUERY: Record<string, string> = {
  horor: "dark horror creepy",
  misteri: "mysterious fog dark",
  psikologi: "mind psychology abstract",
  romance: "romantic couple sunset",
  motivasi: "motivation success sunrise",
  edukasi: "education learning classroom",
  affiliate: "product lifestyle shopping",
  sejarah: "ancient history ruins",
  keuangan: "finance money business",
  custom: "cinematic abstract",
};

/** Pilih file video portrait dengan resolusi terbaik */
function pickBestPortraitFile(files: any[]): { link: string; width: number; height: number } | null {
  const portrait = files
    .filter((f: any) => f.width && f.height && f.height >= f.width)
    .sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
  const best = portrait[0] || files[0];
  if (!best) return null;
  return { link: best.link, width: best.width || 0, height: best.height || 0 };
}

export async function POST(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { query, genre, perPage } = body;

    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "PEXELS_API_KEY tidak tersedia di .env" },
        { status: 500 }
      );
    }

    // Tentukan keyword pencarian
    let searchQuery = (query || "").trim();
    if (!searchQuery && genre) {
      searchQuery = GENRE_FALLBACK_QUERY[genre] || GENRE_FALLBACK_QUERY.custom;
    }
    if (!searchQuery) {
      searchQuery = GENRE_FALLBACK_QUERY.custom;
    }

    const limit = Math.min(Math.max(perPage || 6, 1), 12);

    const res = await fetch(
      `${PEXELS_API_URL}?query=${encodeURIComponent(searchQuery)}&per_page=${limit}&orientation=portrait`,
      { headers: { Authorization: apiKey } }
    );

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Pexels API error (${res.status})` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const videos = json.videos || [];

    const footage: FootageOption[] = videos.map((video: any, i: number) => {
      const best = pickBestPortraitFile(video.video_files || []);
      const image = video.image || "";
      return {
        id: String(video.id || `footage-${i}`),
        videoUrl: best?.link || "",
        thumbnail: image,
        duration: video.duration || 0,
        query: searchQuery,
        source: "pexels",
      };
    });

    return NextResponse.json({ success: true, data: footage });
  } catch (error) {
    console.error("[footage] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}