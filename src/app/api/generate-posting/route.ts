import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { requireProjectOwnership } from "@/lib/project-ownership";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { getServerIdentity } from "@/lib/identity";
import { aiCompletion } from "@/lib/ai/completion";
import { parseJsonLoose } from "@/lib/ai/json";
import { toUserFacingAiError } from "@/lib/ai/errors";

export async function POST(request: NextRequest) {
  const auth = validateApiKey(request);
  if (!auth.valid) {
    console.warn(`[generate-posting] Ditolak (401): ${auth.error || "auth gagal"}`);
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
      console.warn(`[generate-posting] Ditolak (404): project ${projectId} tidak ditemukan/tanpa akses (identity=${identityKey}, userId=${userId ?? "-"})`);
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
      console.warn(`[generate-posting] Ditolak (400): script belum ada untuk project ${projectId}`);
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
      console.warn(`[generate-posting] Ditolak (400): fullScript kosong untuk project ${projectId}`);
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

    const res = await aiCompletion({
      // Caption = tugas ringan → GROQ_MODEL_LIGHT (openai/gpt-oss-20b).
      // `json: true` membuat JSON rusak otomatis memicu pindah ke OpenRouter.
      tier: "light",
      json: true,
      feature: "caption",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1200, // gpt-oss = model reasoning; token berpikir ikut jatah output
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const parsed = parseJsonLoose(res.content) ?? {};
    if (Object.keys(parsed).length === 0) {
      // Gating key/format: JSON parse rapuh → log konten mentah (truncated) untuk diagnosis.
      console.warn(
        `[generate-posting] JSON parse gagal/empty untuk project ${projectId}. Content (300 char): ${res.content.slice(0, 300)}`
      );
    }
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
      console.warn(`[generate-posting] Gagal (502): hasil LLM kosong semua untuk project ${projectId}`);
      return NextResponse.json(
        { success: false, error: "Gagal menghasilkan materi posting. Coba lagi." },
        { status: 502 }
      );
    }

    console.log(
      `[generate-posting] OK project ${projectId}: title=${optimizedTitle.length}c caption=${caption.length}c hashtags=${hashtags.length}`
    );
    return NextResponse.json({ success: true, data: { optimizedTitle, caption, hashtags } });
  } catch (error) {
    // Semua provider AI gagal / key bermasalah / jaringan → pesan jelas bagi user,
    // bukan 500 "Internal server error". Detail tetap dicatat (tanpa API key).
    const friendly = toUserFacingAiError(error);
    if (friendly) {
      console.warn(
        `[generate-posting] AI gagal (${friendly.status}, ${friendly.code}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return NextResponse.json(
        { success: false, code: friendly.code, error: friendly.message },
        { status: friendly.status }
      );
    }
    console.error("[generate-posting] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}