//
/**
 * Topic Extractor — Faza Studio
 *
 * Menerima array judul konten (max 50), mengirim ke Groq (LLM) untuk per judul
 * mengekstrak topik konten yang bermakna dan mengklasifikasikan ke salah satu
 * dari 12 niche. Judul yang tidak relevan → skip.
 *
 * Memakai env GROQ_API_KEY2 (terpisah dari GROQ_API_KEY milik generate script,
 * agar kuota token tidak berbagi). Best-effort: bila gagal/key tak ada →
 * array kosong (tidak pernah throw).
 */

import { aiCompletion } from "@/lib/ai/completion";

/**
 * Model: default mengikuti model ringan Groq (GROQ_MODEL_LIGHT =
 * openai/gpt-oss-20b, pengganti llama-3.1-8b-instant). Override opsional dibaca
 * dari env TOPIC_EXTRACTOR_GROQ_MODEL pada setiap pemanggilan.
 * Model `qwen/qwen3.8-27b` (dipakai sebelumnya) berstatus Preview sehingga
 * tidak lagi dijadikan default.
 */


/** Ke-21 niche yang dipakai klasifikasi (sama seperti di seluruh sistem). */
export const NICHE_SLUGS = [
  "skincare", "fashion", "gadget", "makanan", "suplemen", "perabot",
  "mistis", "motivasi", "edukasi", "keuangan", "curhat", "sejarah",
  "gaming", "hiburan", "musik", "olahraga", "berita",
  "otomotif", "kesehatan", "rumah", "bayi",
] as const;

const VALID_NICHE = new Set<string>(NICHE_SLUGS);

const MAX_INPUT = 150;
const MAX_TOKENS = 4096;

export interface ExtractedTopic {
  topic: string;
  niche: string;
  sourceTitle: string;
  /** Posisi aslinya di array input (untuk menautkan metadata video). */
  index: number;
}

interface RawItem {
  index?: unknown;
  topic?: unknown;
  niche?: unknown;
}

/** Parse JSON-object dari content LLM + filter/validasi item. */
function parseItems(content: string, titles: string[]): ExtractedTopic[] {
  try {
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const parsed = start !== -1 && end > start
      ? JSON.parse(cleaned.slice(start, end + 1))
      : JSON.parse(cleaned);
    const items = parsed && Array.isArray(parsed.items) ? parsed.items : [];

    const out: ExtractedTopic[] = [];
    for (const it of items as RawItem[]) {
      const idx = Number(it?.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= titles.length) continue;
      let topic = typeof it?.topic === "string" ? it.topic.trim() : "";
      const niche = typeof it?.niche === "string" ? it.niche.trim() : "";
      if (!topic || !VALID_NICHE.has(niche)) continue; // skip irrelevant/unknown
      // Konsistensi: topik > 8 kata → potong ke 5 kata pertama (atau skip bila entitlement).
      const words = topic.split(/\s+/).filter(Boolean);
      if (words.length > 10) {
        // Potong ke 10 kata pertama agar konsisten & ringkas.
        topic = words.slice(0, 10).join(" ");
      }
      out.push({ topic, niche, sourceTitle: titles[idx], index: idx });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Panggil AI lewat jalur bersama (Groq → OpenRouter) memakai GROQ_API_KEY2.
 * Retry 429 + perpindahan provider ditangani `src/lib/ai/completion.ts`.
 */
async function groqClassify(
  titles: string[],
  signal?: AbortSignal
): Promise<ExtractedTopic[]> {
  const system =
    "Kamu adalah penulis konten. Ekstrak topik konten yang bermakna dari judul konten " +
    "dan klasifikasikan ke salah satu dari 21 niche: " +
    NICHE_SLUGS.join(", ") +
    ". Output berupa JSON object dengan kunci \"items\": array dari " +
    "{ \"index\": <int posisi dalam array input>, \"topic\": string, \"niche\": string|null }. " +
    "Topic harus deskriptif dan kontekstual, minimal 5 kata maksimal 10 kata. " +
    "Jelaskan KONTEKS topiknya, bukan hanya nama. " +
    "Contoh BENAR: - 'Cara investasi reksa dana untuk pemula 2026' - 'Review laptop gaming RTX 5090 budget terjangkau' " +
    "- 'Tips skincare kulit berminyak untuk iklim tropis' - 'Resep makanan sehat untuk diet rendah karbohidrat'. " +
    "Contoh SALAH: - 'Lagu Never Change' (terlalu pendek, tidak kontekstual) - 'Gameplay Upin Ipin' (tidak ada konteks manfaat) " +
    "- 'Trailer sinetron' (terlalu generik). " +
    "Fokus pada APA MANFAAT atau NILAI konten ini bagi penonton. " +
    "Kalau suatu judul tidak relevan dengan niche apapun, set \"niche\" ke null (dilewati/skipped). " +
    "HARUS return hanya JSON murni — tanpa markdown, tanpa penjelasan, langsung dimulai dengan { dan diakhiri dengan }.";

  const user = "Judul:\n" + JSON.stringify(titles);

  const result = await aiCompletion({
    tier: "light",
    // Override opsional (model lain yang tersedia di akun); default di models.ts.
    model: process.env.TOPIC_EXTRACTOR_GROQ_MODEL?.trim() || undefined,
    groqApiKeySource: "secondary", // GROQ_API_KEY2 → kuota token terpisah
    json: true,
    feature: "topic-extractor",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
    response_format: { type: "json_object" },
    signal,
  });

  console.log(
    `[topic-extractor] provider=${result.provider} fallback=${result.fallback} content length=${result.content.length}`
  );
  const parsed = parseItems(result.content, titles);
  console.log(`[topic-extractor] parseItems result count=${parsed.length}`);
  return parsed;
}

/**
 * Ekstrak topik + niche dari array judul (max 50) lewat jalur AI bersama
 * (Groq dengan GROQ_API_KEY2 → OpenRouter bila Groq gagal).
 * Best-effort: kalau kedua provider gagal → array kosong (tidak pernah throw).
 */
export async function extractTopicsFromTitles(
  titles: string[],
  signal?: AbortSignal
): Promise<ExtractedTopic[]> {
  const slice = titles.slice(0, MAX_INPUT);
  if (slice.length === 0) return [];

  try {
    return await groqClassify(slice, signal);
  } catch (e) {
    console.error("[topic-extractor] Groq gagal:", e instanceof Error ? e.message : e);
    return [];
  }
}