/**
 * GET /api/suggest-ideas?category=horror
 *
 * Generate 5 ide konten via AI (Groq → OpenRouter fallback via aiCompletion).
 *
 * CATATAN PENTING (Task 8):
 * - Endpoint ini MEN-TRIGGER generate AI BARU setiap kali dipanggil (bukan baca cache).
 * - Berpotensi boros API quota Groq/OpenRouter jika dipanggil berulang.
 * - Rate-limit ketat (Task 4) BELUM diintegrasikan di sini — itu Task 11.
 *
 * Response: { success: true, ideas: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { aiCompletion } from "@/lib/ai/completion";
import { validateApiKey } from "@/lib/api-auth";

// Semua kategori acs (10) — bukan cuma 6 dari viraloop asli.
// Nama diambil dari acs/src/lib/categories/index.ts.
const CATEGORY_NAMES: Record<string, string> = {
  horror: "Horor",
  misteri: "Misteri & Fenomena",
  psikologi: "Psikologi",
  romance: "Romance",
  motivasi: "Motivasi",
  edukasi: "Edukasi",
  affiliate: "Affiliate Marketing",
  sejarah: "Sejarah",
  keuangan: "Keuangan",
  custom: "Kustom",
};

const PROMPT = (category: string) => `Berikan 5 ide konten video pendek untuk kategori ${category} yang relevan untuk audiens Indonesia. Ide harus kreatif, spesifik, dan belum terlalu umum.

Aturan:
- Bahasa Indonesia
- Masing-masing ide 3-8 kata
- Fokus pada konten yang relate dengan kehidupan sehari-hari orang Indonesia
- Kreatif dan tidak klise

Respond ONLY with a valid JSON object containing an "ideas" key with an array of strings. No explanation, no markdown, no backticks.
Example: {"ideas": ["ide 1", "ide 2", "ide 3", "ide 4", "ide 5"]}`;

const SYSTEM_MSG =
  "Kamu adalah kreator konten Indonesia yang ahli membuat ide video viral. Selalu respon dengan JSON valid, tanpa markdown atau backticks.";

function parseIdeas(content: string): string[] {
  console.log("[Suggest] Raw AI response:", content);
  let ideas: string[] = [];
  try {
    const parsed = JSON.parse(content);
    console.log("[Suggest] Parsed JSON:", parsed);
    if (Array.isArray(parsed)) {
      ideas = parsed.slice(0, 5);
    } else if (parsed.ideas && Array.isArray(parsed.ideas)) {
      ideas = parsed.ideas.slice(0, 5);
    } else if (parsed.data && Array.isArray(parsed.data)) {
      ideas = parsed.data.slice(0, 5);
    } else if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
      ideas = parsed.suggestions.slice(0, 5);
    } else {
      const firstArray = Object.values(parsed).find((v) => Array.isArray(v));
      if (firstArray) ideas = (firstArray as string[]).slice(0, 5);
    }
  } catch {
    console.log("[Suggest] JSON parse failed, trying fallback");
    ideas = content
      .split("\n")
      .map((l: string) => l.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter((l: string) => l.length > 5)
      .slice(0, 5);
  }
  console.log("[Suggest] Final ideas array:", ideas);
  return ideas;
}

export async function GET(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  const category = request.nextUrl.searchParams.get("category") || "";

  if (!category || !CATEGORY_NAMES[category]) {
    return NextResponse.json(
      { success: false, error: "Kategori tidak valid" },
      { status: 400 }
    );
  }

  const groqKey = process.env.GROQ_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (!groqKey && !openrouterKey) {
    return NextResponse.json(
      { success: false, error: "GROQ_API_KEY dan OPENROUTER_API_KEY tidak tersedia" },
      { status: 503 }
    );
  }

  try {
    const result = await aiCompletion({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_MSG },
        { role: "user", content: PROMPT(CATEGORY_NAMES[category]) },
      ],
      max_tokens: 500,
      temperature: 0.8,
      response_format: { type: "json_object" },
    });

    const ideas = parseIdeas(result.content);

    if (ideas.length === 0) {
      return NextResponse.json(
        { success: false, error: "Semua provider AI gagal" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, ideas });
  } catch (error) {
    console.error("[Suggest] AI error:", error);
    return NextResponse.json(
      { success: false, error: "Semua provider AI gagal" },
      { status: 502 }
    );
  }
}