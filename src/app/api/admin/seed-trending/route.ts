import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { aiCompletion } from "@/lib/ai/completion";

/**
 * GET /api/admin/seed-trending
 *
 * Seed tabel trending_suggestions dengan 3 suggestion per kategori via AI (GROQ).
 * - Ambil semua kategori dari content_categories
 * - Loop tiap kategori, generate 3 suggestion via aiCompletion
 * - Insert ke trending_suggestions
 *
 * Response: { inserted: number, categories: string[] }
 */

const PROMPT = (categoryName: string) =>
  `Berikan 3 topik konten video pendek yang sedang trending untuk kategori ${categoryName} di Indonesia. Format: JSON array string saja, tanpa penjelasan. Contoh: ["topik 1", "topik 2", "topik 3"]`;

const SYSTEM_MSG =
  "Kamu adalah kreator konten Indonesia yang ahli menemukan topik trending. Selalu respon dengan JSON array string valid, tanpa markdown atau backticks.";

function parseTopics(content: string): string[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed.slice(0, 3).map((s: any) => String(s).trim()).filter(Boolean);
    if (parsed.topics && Array.isArray(parsed.topics)) return parsed.topics.slice(0, 3).map((s: any) => String(s).trim()).filter(Boolean);
    if (parsed.ideas && Array.isArray(parsed.ideas)) return parsed.ideas.slice(0, 3).map((s: any) => String(s).trim()).filter(Boolean);
  } catch {
    // fallback: split per baris
    return content
      .split("\n")
      .map((l) => l.replace(/^\d+[\.\)]\s*/, "").replace(/^["'\-\s]+|["'\s]+$/g, "").trim())
      .filter((l) => l.length > 3)
      .slice(0, 3);
  }
  return [];
}

export async function GET(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();

    // 1. Ambil semua kategori
    const { data: categories, error: catError } = await supabase
      .from("content_categories")
      .select("id, slug, name");

    if (catError || !categories) {
      return NextResponse.json({ success: false, error: "Gagal ambil kategori" }, { status: 500 });
    }

    const insertedCategories: string[] = [];
    let inserted = 0;

    // 2. Loop tiap kategori, generate 3 suggestion
    for (const cat of categories) {
      try {
        const result = await aiCompletion({
          model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: SYSTEM_MSG },
            { role: "user", content: PROMPT(cat.name) },
          ],
          max_tokens: 200,
          temperature: 0.8,
          response_format: { type: "json_object" },
        });

        const topics = parseTopics(result.content);
        if (topics.length === 0) continue;

        const rows = topics.map((t) => ({
          category_id: cat.id,
          suggestion_text: t,
          source_pattern: "seed-ai",
        }));

        const { error: insertError } = await supabase.from("trending_suggestions").insert(rows);
        if (insertError) {
          console.warn(`[seed-trending] Insert ${cat.slug} error:`, insertError.message);
          continue;
        }

        inserted += rows.length;
        insertedCategories.push(cat.slug);
      } catch (e) {
        console.warn(`[seed-trending] Generate ${cat.slug} error:`, e);
      }
    }

    return NextResponse.json({ success: true, inserted, categories: insertedCategories });
  } catch (error) {
    console.error("[seed-trending] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}