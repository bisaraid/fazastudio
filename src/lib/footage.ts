/**
 * Shared footage helpers — dipakai oleh /api/footage dan /api/footage/batch.
 * (Wajib di luar route file karena Next.js hanya mengizinkan route handlers
 *  diekspor dari berkas route di folder app/api.)
 */

import { FootageOption } from "./types";
import { buildStockQuery, MIN_CLIP_DURATION_S } from "./stock-query";

const PEXELS_API_URL = "https://api.pexels.com/videos/search";

/** Keyword fallback per genre — dipakai jika query kosong/tidak spesifik */
export const GENRE_FALLBACK_QUERY: Record<string, string> = {
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

/**
 * Pilih thumbnail terbaik dari `video_pictures[]` (Pexels).
 * Preferensi: gambar resolusi menengah agar cepat dimuat; fallback termurah.
 */
function pickBestPexelsThumbnail(pictures: any[]): string {
  if (!Array.isArray(pictures) || pictures.length === 0) return "";
  const pics = pictures
    .map((p: any) => p?.picture)
    .filter((u: any): u is string => typeof u === "string" && u.length > 0);
  if (pics.length === 0) return "";
  return pics[pics.length >= 3 ? 2 : 0];
}

/** Jalankan satu pencarian footage ke Pexels dan map ke FootageOption[]. */
export async function searchFootage(
  apiKey: string,
  searchQuery: string,
  limit: number
): Promise<FootageOption[]> {
  const res = await fetch(
    `${PEXELS_API_URL}?query=${encodeURIComponent(searchQuery)}&per_page=${limit}&orientation=portrait`,
    { headers: { Authorization: apiKey } }
  );

  if (!res.ok) {
    throw new Error(`Pexels API error (${res.status})`);
  }

  const json = await res.json();
  const videos = json.videos || [];

  const mapped: FootageOption[] = videos.map((video: any, i: number) => {
    const best = pickBestPortraitFile(video.video_files || []);
    const poster = pickBestPexelsThumbnail(video.video_pictures || []);
    return {
      id: String(video.id || `footage-${i}`),
      videoUrl: best?.link || "",
      thumbnail: poster || "",
      duration: video.duration || 0,
      query: searchQuery,
      source: "pexels",
    };
  });

  // Tahap A: klip yang cukup panjang untuk satu scene didahulukan (stabil).
  return orderFootageForUse(mapped);
}

/**
 * Sederhanakan query input scene → string pencarian (dengan genre fallback).
 *
 * Tahap A: prompt visual adalah prompt GAMBAR AI (kata gaya + style suffix
 * genre). Query dibangun lewat `buildStockQuery` (fungsi murni yang SAMA
 * dipakai worker — lihat src/lib/stock-query.ts) supaya kedua jalur footage
 * menghasilkan kata kunci yang identik. Fallback genre tetap dipakai apa
 * adanya (string-nya sudah pendek & tidak melewati buildStockQuery).
 */
export function resolveSearchQuery(query: string | undefined, genre: string | undefined): string {
  const built = buildStockQuery(query);
  if (built) return built;
  if (genre && GENRE_FALLBACK_QUERY[genre]) return GENRE_FALLBACK_QUERY[genre];
  return GENRE_FALLBACK_QUERY.custom;
}

/**
 * Urutkan opsi footage: klip dengan durasi cukup untuk satu scene
 * (>= MIN_CLIP_DURATION_S) didahulukan — stabil, urutan relatif tidak berubah.
 * Ini hanya PEMILIHAN klip: konsumen yang mengambil `data[0]` (usePipeline)
 * otomatis mendapat klip yang tidak terpotong terlalu pendek.
 */
export function orderFootageForUse(footage: FootageOption[]): FootageOption[] {
  return footage
    .map((option, index) => ({ option, index }))
    .sort((a, b) => {
      const aShort = (Number(a.option.duration) || 0) < MIN_CLIP_DURATION_S ? 1 : 0;
      const bShort = (Number(b.option.duration) || 0) < MIN_CLIP_DURATION_S ? 1 : 0;
      return aShort - bShort || a.index - b.index;
    })
    .map((entry) => entry.option);
}
