import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { requireProjectOwnership } from "@/lib/project-ownership";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { getServerIdentity } from "@/lib/identity";
import { groqCompletion } from "@/lib/ai/groq";

/** Ambil objek JSON dari content LLM (tahan ```json ... ``` / teks di sekitarnya). */
function parseJsonLoose(content: string): Record<string, unknown> {
  try {
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    return JSON.parse(cleaned);
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return NextResponse.json({ success: false, error: "Field projectId wajib diisi" }, { status: 400 });
    }

    const identity = getServerIdentity(request);
    const identityKey = identity.identityKey;
    const session = createSupabaseServerClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    const userId = user?.id ?? null;

    // Ownership guard (IDOR)
    const owned = await requireProjectOwnership({ projectId, identityKey, userId });
    if (!owned) {
      return NextResponse.json(
        { success: false, error: "Project tidak ditemukan of geen toegang" },
        { status: 404 }
      );
    }

    const supabase = createServiceRoleClient();
    const { data: proj } = await supabase
      .from("projects")
      .select("script, platform, genre_slug")
      .eq("id", projectId)
      .maybeSingle();

    if (!proj?.script) {
      return NextResponse.json({ success: false, error: "Script belum ada" }, { status: 400 });
    }

    let fullScript = "";
    try {
      const parsed = typeof proj.script === "string" ? JSON.parse(proj.script) : proj.script;
      fullScript = typeof parsed?.fullScript === "string" ? parsed.fullScript : "";
    } catch {
      fullScript = "";
    }
    if (!fullScript.trim()) {
      return NextResponse.json({ success: false, error: "fullScript kosong" }, { status: 400 });
    }

    const platform = typeof proj.platform === "string" ? proj.platform : "tiktok";
    const genre = typeof proj.genre_slug === "string" ? proj.genre_slug : "";

    const system =
      "Kamu adalah social media content specialist. Dari sebuah script konten, siapkan materi posting " +
      "untuk platform " + platform + ". Kembalikan HANYA JSON object dengan kunci: " +
      "{\"optimizedTitle\": string, \"caption\": string, \"hashtags\": string[]}. " +
      "- optimizedTitle: judul video yang menarik & dioptimasi untuk platform ini, MAKSIMAL 60 karakter. " +
      "- caption: caption siap posting MAKSIMAL 150 karakter, dengan emoji relevan yang tahan spam, 1-2 baris. " +
      "- hashtags: array 10-15 hashtag relevan dengan niche (" + (genre || "umum") + ") dan platform. " +
      "HARUS return hanya JSON murni, tanpa markdown, tanpa teks lain.";

    const userPrompt =
      "Platform: " + platform + "\nGenre/Niche: " + (genre || "umum") + "\n\nScript:\n" + fullScript.slice(0, 4000);

    const res = await groqCompletion({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 700,
      temperature: 0.7,
    });

    const parsed = parseJsonLoose(res.content);
    const optimizedTitle =
      typeof parsed.optimizedTitle === "string" ? parsed.optimizedTitle.trim().slice(0, 60) : "";
    const caption =
      typeof parsed.caption === "string" ? parsed.caption.trim().slice(0, 160) : "";
    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags
          .filter((h): h is string => typeof h === "string")
          .map((h) => (h.startsWith("#") ? h.slice(1) : h).trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 15)
      : [];

    if (!optimizedTitle && !caption && hashtags.length === 0) {
      return NextResponse.json(
        { success: false, error: "Gagal menghasilkan materi posting. Coba lagi." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: { optimizedTitle, caption, hashtags } });
  } catch (error) {
    console.error("[generate-posting] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}