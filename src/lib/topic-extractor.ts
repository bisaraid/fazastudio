/**
 * Topic Extractor — Faza Studio
 *
 * Neem array judul video (max 50), stuurt naar OpenRouter (LLM) om per judul
 * een bermakelijk konten-topik te ekstrahieren en te klassificeren in a van de
 * 12 niche. Niet-relevante judul → skip.
 *
 * Best-effort: bij fout/key onbeschikbaar → lege array (nooit throw).
 */

import { openrouterCompletion } from "@/lib/ai/openrouter";

/** De 12 niche waarnaar geclassificeerd wordt (zelfde als system). */
export const NICHE_SLUGS = [
  "skincare", "fashion", "gadget", "makanan", "suplemen", "perabot",
  "mistis", "motivasi", "edukasi", "keuangan", "curhat", "sejarah",
] as const;

const VALID_NICHE = new Set<string>(NICHE_SLUGS);

const PRIMARY_MODEL = process.env.TOPIC_EXTRACTOR_MODEL || "google/gemini-flash-1.5";
const FALLBACK_MODEL = "openai/gpt-4o-mini";
const MAX_INPUT = 50;
const MAX_TOKENS = 2048;

export interface ExtractedTopic {
  topic: string;
  niche: string;
  sourceTitle: string;
  /** Posisi original in de input-array (om metadata terug te linken). */
  index: number;
}

interface RawItem {
  index?: unknown;
  topic?: unknown;
  niche?: unknown;
}

/** Parse JSON-object uit LLM content + filter/validate items. */
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
      if (!topic || !VALID_NICHE.has(niche)) continue; // skip irrelevant/unknow
      out.push({ topic, niche, sourceTitle: titles[idx], index: idx });
    }
    return out;
  } catch {
    return [];
  }
}

/** Aanroep OpenRouter met gebruike model en parse antwoord. */
async function runModel(
  model: string,
  titles: string[],
  signal?: AbortSignal
): Promise<ExtractedTopic[]> {
  const system =
    "Kamu bent een content strategen. Ekstrahieren een bermakelijk konten-topik " +
    "uit elke judul video en klassificeer het naar een van deze 12 niches: " +
    NICHE_SLUGS.join(", ") +
    ". Geef alleen een JSON object met de key \"items\": een array van " +
    "{ \"index\": <int, de positie in de invoer-array>, \"topic\": string, \"niche\": string|null }. " +
    "Topic moet een kort, zinvol onderwerp zijn (niet de ruwe judul, geen hashtag/merk). " +
    "Alleen outputs voor judul die in een niche passen; zet \"niche\" op null voor de rest.";

  const user = "Judul:\n" + JSON.stringify(titles);

  const res = await openrouterCompletion({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: MAX_TOKENS,
    response_format: { type: "json_object" },
    temperature: 0.2,
    signal,
  });

  return parseItems(res.content, titles);
}

/**
 * Ekstraheer topics + niche uit een array judul (max 50) via OpenRouter.
 * Primary model (default google/gemini-flash-1.5); bij fout → fallback
 * (openai/gpt-4o-mini); als beide falen → lege array.
 */
export async function extractTopicsFromTitles(
  titles: string[],
  signal?: AbortSignal
): Promise<ExtractedTopic[]> {
  const slice = titles.slice(0, MAX_INPUT);
  if (slice.length === 0) return [];
  if (!process.env.OPENROUTER_API_KEY) return [];

  try {
    return await runModel(PRIMARY_MODEL, slice, signal);
  } catch (primaryErr) {
    console.error(
      "[topic-extractor] primary gagal:",
      primaryErr instanceof Error ? primaryErr.message : primaryErr
    );
    try {
      return await runModel(FALLBACK_MODEL, slice, signal);
    } catch (fallbackErr) {
      console.error(
        "[topic-extractor] fallback gagal:",
        fallbackErr instanceof Error ? fallbackErr.message : fallbackErr
      );
      return [];
    }
  }
}