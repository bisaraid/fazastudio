/**
 * Translasi judul/tautan video → Bahasa Indonesia, berbasis Groq (reuse GROQ_API_KEY).
 *
 * Dipakai Trend Pattern Engine untuk harvest YouTube US: keyword EN-US di-terjemahkan
 * menjadi keyword ID sebelum disimpan ke `trend_ideas` dengan source "youtube_us".
 *
 * Best-effort oleh desain: kalau Groq gagal / format tak sesuai → kembalikan teks asli,
 * sehingga never crash → tidak pernah memblokir cron.
 */

import { aiCompletion } from "@/lib/ai/completion";

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

/** Bersihkan wrapping code-fence bila Groq membungkus dengan ```json ... ``` */
function parseJsonArrayLike(content: string): unknown {
  let cleaned = content.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  // Ambil objek JSON pertama yang valid bila ada teks di sekelilingnya.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Terjemahkan banyak judul sekaligus (hemat token & latency).
 * Mengembalikan array dengan panjang sama seperti input; bila gagal, item
 * jatuh kembali ke teks asli (tidak pernah throw).
 */
export async function translateMany(texts: string[]): Promise<string[]> {
  if (!texts || texts.length === 0) return [];

  // Biar urutan output stabil, kita buat indexing sederhana.
  const pairs = texts.map((t, i) => ({ i, text: t }));
  const originals = pairs.map((p) => p.text);

  try {
    const result = await aiCompletion({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Kamu menerjemahkan judul video YouTube dari bahasa apapun ke Bahasa Indonesia yang natural dan singkat (maks 12 kata).",
        },
        {
          role: "user",
          content:
            'Terjemahkan setiap judul ke Bahasa Indonesia. Pertahankan istilah umum (mis. brand, angka, hashtag).\n' +
            'Format output HARUS JSON object tunggal dengan kunci "translations" berisi array string, panjangnya sama dengan input.\n' +
            `INPUT (JSON array):\n${JSON.stringify(originals)}`,
        },
      ],
      max_tokens: 400,
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const parsed = parseJsonArrayLike(result.content);
    const arr = parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>).translations
      : null;
    if (Array.isArray(arr) && arr.length === texts.length) {
      return pairs.map((p, idx) =>
        typeof arr[idx] === "string" && (arr[idx] as string).trim()
          ? (arr[idx] as string).trim().slice(0, 200)
          : p.text
      );
    }
    // Format tak sesuai → fallback asli.
    return originalItems(texts);
  } catch (e) {
    console.error("[translate] translasi gagal (fallback ke asli):", (e as Error)?.message);
    return originalItems(texts);
  }
}

function originalItems(texts: string[]): string[] {
  return texts.map((t) => t.trim().slice(0, 200));
}

/** Terjemahkan satu judul → Bahasa Indonesia (best-effort, fallback ke asli). */
export async function translateToId(text: string): Promise<string> {
  const out = await translateMany([text]);
  return out[0] ?? text;
}