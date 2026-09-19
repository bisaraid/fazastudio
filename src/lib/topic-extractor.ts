//
/**
 * Topic Extractor — Faza Studio
 *
 * Menerima array judul video (max 50), mengirim ke Groq (LLM) untuk per judul
 * mengekstrak topik konten yang bermakna dan mengklasifikasikan ke salah satu
 * dari 12 niche. Judul yang tidak relevan → skip.
 *
 * Memakai env GROQ_API_KEY2 (terpisah dari GROQ_API_KEY milik generate script,
 * agar kuota token tidak berbagi). Best-effort: bila gagal/key tak ada →
 * array kosong (tidak pernah throw).
 */

const GROQ_API_BASE = "https://api.groq.com/openai/v1";

/** Model sama dengan yang dipakai generate script / translate. */
const MODEL = process.env.TOPIC_EXTRACTOR_GROQ_MODEL || "qwen/qwen3.8-27b";

/** Ke-12 niche yang dipakai klasifikasi (sama seperti di seluruh sistem). */
export const NICHE_SLUGS = [
  "skincare", "fashion", "gadget", "makanan", "suplemen", "perabot",
  "mistis", "motivasi", "edukasi", "keuangan", "curhat", "sejarah",
] as const;

const VALID_NICHE = new Set<string>(NICHE_SLUGS);

const MAX_INPUT = 50;
const MAX_TOKENS = 2048;

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

interface GroqMessage {
  role: "system" | "user";
  content: string;
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
      const topic = typeof it?.topic === "string" ? it.topic.trim() : "";
      const niche = typeof it?.niche === "string" ? it.niche.trim() : "";
      if (!topic || !VALID_NICHE.has(niche)) continue; // skip irrelevant/unknown
      out.push({ topic, niche, sourceTitle: titles[idx], index: idx });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Fetch Groq dengan retry + backoff untuk status 429 (rate limit).
 * Pola sama dengan src/lib/ai/groq.ts: baca header Retry-After (default 15s).
 */
async function callGroqWithRetry(
  url: string,
  init: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, init);
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "15", 10);
      const safeRetry = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 15;
      console.warn(`[topic-extractor] Groq 429 - retry ${i + 1}/${maxRetries} after ${safeRetry}s`);
      await new Promise((r) => setTimeout(r, safeRetry * 1000));
      continue;
    }
    return res;
  }
  throw new Error("Groq max retries exceeded");
}

/** Panggil Groq chat/completions dengan GROQ_API_KEY2. */
async function groqClassify(
  titles: string[],
  signal?: AbortSignal
): Promise<ExtractedTopic[]> {
  const apiKey = process.env.GROQ_API_KEY2;
  if (!apiKey) {
    console.warn("[topic-extractor] GROQ_API_KEY2 tidak tersedia");
    return [];
  }

  const system =
    "Kamu adalah penulis konten. Ekstrak topik konten yang bermakna dari judul video YouTube " +
    "dan klasifikasikan ke salah satu dari 12 niche: " +
    NICHE_SLUGS.join(", ") +
    ". Output berupa JSON object dengan kunci \"items\": array dari " +
    "{ \"index\": <int posisi dalam array input>, \"topic\": string, \"niche\": string|null }. " +
    "Topic harus topik yang ringkas dan bermakna (bukan judul mentah, bukan hashtag/merk). " +
    "Kalau suatu judul tidak relevan dengan niche apapun, set \"niche\" ke null (dilewati/skipped). " +
    "HARUS return hanya JSON murni — tanpa markdown, tanpa penjelasan, langsung dimulai dengan { dan diakhiri dengan }.";

  const user = "Judul:\n" + JSON.stringify(titles);

  const init: RequestInit = {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ] as GroqMessage[],
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
    }),
  };

  const response = await callGroqWithRetry(`${GROQ_API_BASE}/chat/completions`, init);

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[topic-extractor] Groq error ${response.status}:`, errorBody.slice(0, 300));
    return [];
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return parseItems(content, titles);
}

/**
 * Ekstrak topik + niche dari array judul (max 50) via Groq (GROQ_API_KEY2).
 * Best-effort: kalau Groq gagal / key tak ada → array kosong.
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