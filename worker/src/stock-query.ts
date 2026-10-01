/**
 * stock-query — query builder untuk footage stok (Tahap A).
 *
 * Masalah yang diperbaiki: `visualPrompt`/`image_prompt` adalah prompt gambar AI
 * yang penuh kata GAYA ("illustration", "sepia tones", "muted colors",
 * "cinematic lighting", "realism") + suffix gaya per genre. Kata-kata itu buruk
 * sebagai kata kunci stok (tidak ada di tag video Pexels) dan menenggelamkan
 * subjek nyata scene.
 *
 * Fungsi di sini MURNI (tanpa I/O, tanpa env, tanpa akses jaringan):
 *   - buildStockQuery(prompt)            → 3-7 kata kunci (subjek + setting + aksi)
 *   - buildStockQueryVariants(prompt)    → query utama + 2 variasi lebih pendek
 *   - pickClipCandidate(candidates, …)   → pilih 1 klip dari 5 kandidat teratas
 *
 * ⚠️ SALINAN KEMBAR — file ini punya DUA kopi yang WAJIB IDENTIK byte-per-byte:
 *   - src/lib/stock-query.ts     (dipakai app Next.js: /api/footage + batch)
 *   - worker/src/stock-query.ts  (dipakai worker render — package TERPISAH,
 *                                 rootDir sendiri, jadi tidak boleh mengimpor
 *                                 dari src/)
 * Jangan pernah mengubah hanya satu sisi. Test
 * `src/lib/__tests__/stock-query.test.ts` membandingkan KELUARAN kedua kopi
 * pada contoh yang sama DAN membandingkan isi kedua file.
 */

/** Jumlah kata maksimum untuk query utama (subjek + setting + aksi). */
export const STOCK_QUERY_MAX_WORDS = 7;
/** Jumlah kata minimum agar query dianggap "layak" (3 kata). */
export const STOCK_QUERY_MIN_WORDS = 3;
/** Jumlah kata untuk query cadangan (dipakai bila query utama kosong hasilnya). */
export const STOCK_QUERY_VARIANT_WORD_COUNTS = [5, 3] as const;
/** Klip lebih pendek dari ini dianggap "terlalu pendek" untuk satu scene. */
export const MIN_CLIP_DURATION_S = 4;

/**
 * Kata GAYA / render AI — kualitas visual, bukan objek. Tidak berguna sebagai
 * kata kunci stok (bukan tag video) → dibuang dari query.
 */
const STYLE_WORDS = new Set<string>([
  // gaya gambar / render
  "illustration", "illustrations", "illustrated", "stylized", "stylised", "style", "styles",
  "aesthetic", "aesthetics", "render", "rendered", "rendering", "cgi", "3d", "2d",
  "art", "artwork", "painting", "watercolor", "vector", "flat", "graphic", "infographic",
  "photographic", "photography", "photorealistic", "realistic", "realism", "hyperrealistic",
  "surreal", "cartoon", "anime", "sketch", "meme", "emoji", "clipart",
  // sinematografi / atmosfer
  "cinematic", "cinematography", "atmosphere", "atmospheric", "mood", "moody", "vibe",
  "ambiance", "ambience", "lighting", "tense", "dramatic", "epic", "eerie", "creepy",
  "spooky", "scary", "horror", "haunted", "dark", "feel",
  // warna / tone
  "sepia", "pastel", "monochrome", "vibrant", "vivid", "muted", "desaturated", "saturation",
  "contrast", "palette", "tones", "tone", "color", "colors", "colour", "colours", "neutral",
  // suffix genre (framing/klaim gaya yang tidak membantu pencarian stok)
  "documentary", "investigative", "factual", "grounded", "evidence-based", "historical",
  "setting", "period", "relevant", "representing", "topic", "niche", "metaphor",
  // sifat / kualitas generik
  "bold", "dynamic", "modern", "clean", "bright", "soft", "professional",
  "commercial", "corporate", "minimalist", "minimal", "elegant", "sleek", "premium",
  "informative", "engaging", "educational", "motivational", "emotional", "friendly",
  "high", "quality", "detailed", "detail", "ultra", "resolution", "hd", "uhd", "4k", "8k",
  // misc gaya
  "texture", "composition", "depth", "field", "bokeh", "grain", "vignette", "ethereal",
  "dreamy", "calm", "faint", "design", "layout", "visual", "visuals", "imagery",
]);

/**
 * Kata FORMAT / framing — sudah dikontrol lewat parameter API (orientation,
 * durasi, dsb) atau tidak relevan untuk pencarian → dibuang.
 */
const FORMAT_WORDS = new Set<string>([
  "drone", "aerial", "timelapse", "hyperlapse", "lapse", "slo", "slowmo", "slow",
  "motion", "loop", "looping", "seamless", "vertical", "horizontal", "orientation",
  "aspect", "ratio", "footage", "clip", "video", "stock", "gif", "animated", "animation",
  "stopmotion", "fisheye", "360", "pov", "broll",
]);

/** Kata umum (stopword) yang tidak membawa sinyal pencarian. */
const STOPWORDS = new Set<string>([
  "a", "an", "the", "of", "in", "on", "at", "to", "from", "into", "onto", "upon", "with",
  "without", "within", "over", "under", "above", "below", "beneath", "behind", "beside",
  "between", "among", "across", "along", "around", "about", "through", "toward", "towards",
  "by", "for", "till", "until",
  "near", "next", "off", "out", "up", "down", "inside", "outside", "during", "before",
  "after", "while", "when", "where", "which", "who", "whom", "whose", "why", "how", "what",
  "and", "or", "but", "nor", "so", "yet", "as", "if", "then", "than", "that", "this",
  "these", "those", "there", "here", "it", "its", "is", "are", "was", "were", "be", "been",
  "being", "am", "do", "does", "did", "done", "has", "have", "had", "having", "will",
  "would", "shall", "should", "can", "could", "may", "might", "must", "not", "no", "only",
  "also", "too", "very", "just", "more", "most", "much", "many", "some", "any", "all",
  "both", "each", "every", "few", "less", "least", "other", "another", "same", "own",
  "such", "via", "per", "etc", "he", "she", "they", "we", "you", "i", "his", "her",
  "their", "our", "your", "my", "me", "him", "them", "us", "himself", "herself", "itself",
  "myself", "yourself", "themselves", "ourselves", "whether", "though", "although",
  "because", "since", "unless", "else", "still", "ever", "never", "always",
  "often", "sometimes", "usually", "quite", "rather", "somewhat", "really", "set",
]);

export interface PickClipOptions {
  /** Ambil kandidat hanya dari N teratas (default 5). */
  poolSize?: number;
  /** Durasi minimum agar klip dianggap layak untuk satu scene (default 4 dtk). */
  minDurationSeconds?: number;
  /**
   * Seed deterministik untuk memilih kandidat di dalam pool (default 0).
   * Worker memakai `usedIds.size` supaya scene ke-N tidak selalu mulai dari
   * kandidat pertama (variasi) — tetap deterministik ⇒ bisa diuji.
   */
  seed?: number;
}

/** Token kanonik: pisahkan tanda baca; buang potongan angka. */
function tokenize(text: string): string[] {
  return String(text || "")
    .replace(/\[[^\]]*\]/g, " ") // buang teks dalam [...] (placeholder/instruksi)
    .replace(/\+/g, " ") // '+' → spasi
    .replace(/[^a-zA-Z\s'-]/g, " ") // koma, titik dua, titik, dll → spasi
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[-']+|[-']+$/g, ""))
    .filter((t) => t.length > 1 && /[a-z]/.test(t));
}

/** Token yang dipertahankan sebagai kata kunci (bukan stopword/gaya/format). */
function isContentToken(token: string): boolean {
  return !STOPWORDS.has(token) && !STYLE_WORDS.has(token) && !FORMAT_WORDS.has(token);
}

/**
 * Apakah segmen koma ini layak dipertahankan?
 *
 * Style suffix genre selalu ditulis sebagai segmen koma di AKHIR prompt
 * (mis. ", dark horror illustration, eerie atmosphere, ..."). Segmen seperti
 * itu: (a) tidak menyisakan kata konten sama sekali, atau (b) hanya menyisakan
 * SATU kata setelah mayoritas katanya dibuang sebagai kata gaya
 * (mis. "indonesian historical setting" → "indonesian"). Keduanya dibuang.
 */
function keepSegment(tokens: string[]): boolean {
  const content = tokens.filter(isContentToken);
  if (content.length === 0) return false;
  if (content.length === 1) {
    const styleShare = (tokens.length - content.length) / tokens.length;
    if (styleShare >= 0.5) return false;
  }
  return true;
}

/**
 * Ubah prompt visual (gaya gambar AI) menjadi query footage stok pendek:
 * 3-7 kata kunci berurutan (subjek → setting → aksi), TANPA kata gaya/format,
 * tanpa stopword, tanpa teks dalam [...], tanpa duplikat.
 *
 * @returns string kosong bila tidak ada kata kunci yang tersisa (caller harus
 *          memakai fallback genre).
 */
export function buildStockQuery(
  prompt: string | null | undefined,
  maxWords: number = STOCK_QUERY_MAX_WORDS
): string {
  const raw = String(prompt ?? "");
  if (!raw.trim()) return "";
  const cap = Math.max(STOCK_QUERY_MIN_WORDS, Math.min(STOCK_QUERY_MAX_WORDS, maxWords));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const segment of raw.split(/[,;.]/)) {
    const tokens = tokenize(segment);
    if (tokens.length === 0 || !keepSegment(tokens)) continue;
    for (const token of tokens) {
      if (!isContentToken(token) || seen.has(token)) continue;
      seen.add(token);
      out.push(token);
      if (out.length >= cap) return out.join(" ");
    }
  }
  return out.join(" ");
}

/**
 * Daftar query yang dicoba BERURUTAN bila hasilnya kosong:
 *   [query utama (≤7 kata), variasi 5 kata, variasi 3 kata]
 * Fallback genre/generik TIDAK di sini (itu tanggung jawab caller supaya
 * mapping genre tetap satu sumber).
 */
export function buildStockQueryVariants(prompt: string | null | undefined): string[] {
  const primary = buildStockQuery(prompt);
  if (!primary) return [];
  const words = primary.split(" ");
  const variants: string[] = [primary];
  for (const count of STOCK_QUERY_VARIANT_WORD_COUNTS) {
    if (words.length > count) variants.push(words.slice(0, count).join(" "));
  }
  return variants;
}

/**
 * Pilih SATU klip dari kandidat: pool = 5 teratas yang belum dipakai, utamakan
 * durasi >= minDurationSeconds, lalu pilih indeks `seed % pool.length`
 * (deterministik). Dedupe tetap lewat `usedIds` (caller yang menambahkan id).
 */
export function pickClipCandidate<T extends { id: string; duration?: number }>(
  candidates: T[],
  usedIds: Set<string> | undefined = undefined,
  options: PickClipOptions = {}
): T | null {
  const poolSize = Math.max(1, options.poolSize ?? 5);
  const minDuration = options.minDurationSeconds ?? MIN_CLIP_DURATION_S;
  const fresh = (candidates || []).filter((c) => c && !(usedIds && usedIds.has(c.id)));
  if (fresh.length === 0) return null;
  const top = fresh.slice(0, poolSize);
  const longEnough = top.filter((c) => (Number(c.duration) || 0) >= minDuration);
  const pool = longEnough.length > 0 ? longEnough : top;
  const seed = Math.abs(Math.trunc(options.seed ?? 0));
  return pool[seed % pool.length];
}

