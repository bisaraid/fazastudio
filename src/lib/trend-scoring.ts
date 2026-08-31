/**
 * Trend Scoring Engine — Faza Studio
 *
 * Menghitung skor trend berdasarkan:
 * - Momentum (velocity): viewCount / hoursSincePublished
 * - Relevance: keyword match dengan niche keywords
 * - Recency: semakin baru, semakin tinggi skor
 * - Rank bonus: posisi di chart YouTube (rank 1 = +10, dst)
 *
 * Output: score 0-100 (normalized)
 */

import { YouTubeVideo } from "./trend-youtube";

/** Keywords per niche untuk relevance matching */
const NICHE_KEYWORDS: Record<string, string[]> = {
  // Jualan
  skincare: ["skincare", "kecantikan", "perawatan kulit", "wajah", "kulit", "serum", "moisturizer", "sunscreen", "acne", "glowing"],
  fashion: ["fashion", "outfit", "style", "baju", "trend fashion", "ootd", "fashion hijab", "sepatu", "tas"],
  gadget: ["gadget", "teknologi", "hp", "laptop", "elektronik", "review gadget", "smartphone", "tablet", "kamera"],
  makanan: ["makanan", "minuman", "resep", "kuliner", "makan", "makanan indonesia", "street food", "restoran", "cafe"],
  suplemen: ["suplemen", "kesehatan", "vitamin", "diet", "herbal", "obat", "supplement", "turun berat", "otot"],
  perabot: ["rumah", "perabot", "dekorasi", "furniture", "home", "interior", "ruang tamu", "kamar", "dapur"],
  // Konten
  mistis: ["mistis", "horor", "hantu", "seram", "cerita horor", "kuntilanak", "pocong", "jin", "tempat angker"],
  motivasi: ["motivasi", "kehidupan", "inspirasi", "sukses", "semangat", "tips sukses", "mindset", "self improvement"],
  edukasi: ["edukasi", "tips", "belajar", "pendidikan", "ilmu", "tutorial", "cara", "how to", "pengetahuan"],
  keuangan: ["uang", "investasi", "keuangan", "saham", "crypto", "finansial", "menabung", "passive income", "ekonomi"],
  curhat: ["curhat", "relationship", "cinta", "persahabatan", "keluarga", "jangan menikah", "mantan", "hubungan"],
  sejarah: ["sejarah", "fakta", "kerajaan", "dunia", "sejarah indonesia", "zaman dulu", "penemuan", "perang", "tokoh"],
};

export interface ScoredTrend {
  keyword: string;           // judul video sebagai keyword
  score: number;             // 0-100
  breakdown: {
    momentum: number;        // 0-40
    relevance: number;       // 0-30
    recency: number;         // 0-20
    rankBonus: number;       // 0-10
  };
  youtubeVideoId?: string;
  youtubeTitle?: string;
  youtubeChannel?: string;
  youtubeViews: number;
  youtubeLikes: number;
  youtubeUploadedAt?: string;
}

/**
 * Calculate momentum score: views per hour (normalized to 0-40)
 */
function calcMomentum(video: YouTubeVideo): number {
  const hoursSincePublished = Math.max(
    (Date.now() - new Date(video.publishedAt).getTime()) / (1000 * 60 * 60),
    0.1 // min 0.1 jam untuk hindari division by zero
  );
  const viewsPerHour = video.viewCount / hoursSincePublished;
  
  // Normalize: 10000 views/jam = max score (40)
  // log scale karena range bisa sangat besar
  const score = Math.min(40, Math.log10(viewsPerHour + 1) / Math.log10(10000) * 40);
  return Math.round(score * 10) / 10;
}

/**
 * Calculate relevance score: keyword match dengan niche (0-30)
 */
function calcRelevance(title: string, niche: string): number {
  const keywords = NICHE_KEYWORDS[niche] ?? [];
  const titleLower = title.toLowerCase();
  
  let matchCount = 0;
  for (const kw of keywords) {
    if (titleLower.includes(kw.toLowerCase())) {
      matchCount++;
    }
  }
  
  // Setiap match = +6 poin, max 30 (5 match)
  return Math.min(30, matchCount * 6);
}

/**
 * Calculate recency score: semakin baru semakin tinggi (0-20)
 */
function calcRecency(publishedAt: string): number {
  const hoursSincePublished = Math.max(
    (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60),
    0
  );
  
  // < 6 jam = 20, < 24 jam = 15, < 72 jam = 10, else 5
  if (hoursSincePublished < 6) return 20;
  if (hoursSincePublished < 24) return 15;
  if (hoursSincePublished < 72) return 10;
  return 5;
}

/**
 * Calculate rank bonus: posisi di chart (0-10)
 * Rank 1 = 10, Rank 2 = 9, ..., Rank 10 = 1
 */
function calcRankBonus(index: number): number {
  return Math.max(0, 10 - index);
}

/**
 * Score array of YouTube videos untuk niche tertentu.
 * Return sorted by score desc.
 */
export function scoreTrends(
  videos: YouTubeVideo[],
  niche: string
): ScoredTrend[] {
  return videos
    .map((video, index) => {
      const momentum = calcMomentum(video);
      const relevance = calcRelevance(video.title, niche);
      const recency = calcRecency(video.publishedAt);
      const rankBonus = calcRankBonus(index);
      
      const totalScore = momentum + relevance + recency + rankBonus;
      
      return {
        keyword: video.title,
        score: Math.round(totalScore * 10) / 10,
        breakdown: { momentum, relevance, recency, rankBonus },
        youtubeVideoId: video.videoId,
        youtubeTitle: video.title,
        youtubeChannel: video.channelTitle,
        youtubeViews: video.viewCount,
        youtubeLikes: video.likeCount,
        youtubeUploadedAt: video.publishedAt,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Get top N trends dari scored list.
 */
export function getTopTrends(scored: ScoredTrend[], n: number = 5): ScoredTrend[] {
  return scored.slice(0, n);
}
