/**
 * Parser JSON longgar untuk keluaran LLM — murni, tanpa I/O.
 *
 * Model reasoning (gpt-oss di Groq) mengembalikan teks pemikiran di field
 * terpisah (`message.reasoning`) sehingga `content` sudah bersih; namun sebagian
 * provider/model masih bisa membocorkan teks pemikiran atau code-fence ke
 * `content` → dibersihkan di sini sebelum parsing.
 */

/** Buang code-fence (```json ... ```) dan blok pemikiran yang bocor ke content. */
export function cleanLlmContent(content: string): string {
  let cleaned = (content ?? "").trim();
  // Blok pemikiran eksplisit (mis. <thinking>...</thinking>) — beberapa provider.
  cleaned = cleaned.replace(/<(thinking|reasoning|analysis)>[\s\S]*?<\/\1>/gi, "");
  // Code fence di awal/akhir.
  cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```\s*$/, "");
  return cleaned.trim();
}

/** Ambil blok JSON pertama (objek atau array) dari teks yang mungkin berisi prosa. */
export function extractJsonBlock(cleaned: string): string | null {
  const objStart = cleaned.indexOf("{");
  const arrStart = cleaned.indexOf("[");
  let start = -1;
  let end = -1;

  const useObject = objStart !== -1 && (arrStart === -1 || objStart < arrStart);
  if (useObject) {
    start = objStart;
    end = cleaned.lastIndexOf("}");
  } else if (arrStart !== -1) {
    start = arrStart;
    end = cleaned.lastIndexOf("]");
  }

  if (start === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

function parseJsonValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Objek JSON dari content LLM; `null` bila tidak valid. */
export function parseJsonLoose(content: string): Record<string, unknown> | null {
  const cleaned = cleanLlmContent(content);
  if (!cleaned) return null;

  const block = extractJsonBlock(cleaned) ?? cleaned;
  const parsed = parseJsonValue(block);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

/**
 * Array JSON dari content LLM. Menerima:
 *  - array murni `["a","b"]`
 *  - objek pembungkus, mis. `{"ideas":[...]}` → ambil nilai array pertama
 * `null` bila tidak ada array yang bisa dipakai.
 */
export function parseJsonArrayLoose(content: string): unknown[] | null {
  const cleaned = cleanLlmContent(content);
  if (!cleaned) return null;

  const block = extractJsonBlock(cleaned) ?? cleaned;
  const parsed = parseJsonValue(block);

  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) return value;
    }
  }
  return null;
}
