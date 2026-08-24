import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getClientIp } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const ip = getClientIp(request);
    const identityKey = `anon:${ip}`;

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("identity_key", identityKey)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[projects] GET error:", error);
      return NextResponse.json({ success: false, error: "Gagal mengambil projects" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("[projects] GET error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const ip = getClientIp(request);
    const identityKey = `anon:${ip}`;

    const supabase = createServiceRoleClient();

    // Resolve category_id dari slug genre
    let categoryId: string | null = null;
    if (body.genre) {
      const { data: catData } = await supabase
        .from("content_categories")
        .select("id")
        .eq("slug", body.genre)
        .single();
      categoryId = catData?.id ?? null;
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        identity_key: identityKey,
        title: body.title || body.topic || null,
        category_id: categoryId,
        status: body.status || "draft",
        script: body.script ? JSON.stringify(body.script) : null,
        audio_url: body.audioUrl || null,
        subtitle_url: body.subtitleUrl || null,
        video_url: body.videoUrl || null,
        hook_pattern: body.hookPattern || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[projects] POST error:", error);
      return NextResponse.json({ success: false, error: "Gagal menyimpan project" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[projects] POST error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { projectId, script } = body;

    // Validasi field wajib
    if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Field projectId wajib diisi" },
        { status: 400 }
      );
    }
    if (!script) {
      return NextResponse.json(
        { success: false, error: "Field script wajib diisi" },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Update kolom script (TEXT) + updated_at
    const { error } = await supabase
      .from("projects")
      .update({
        script: JSON.stringify(script),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    if (error) {
      console.error("[projects] PATCH error:", error);
      return NextResponse.json({ success: false, error: "Gagal menyimpan script project" }, { status: 500 });
    }

    console.log(`[Script] Persist edited script: ${projectId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[projects] PATCH error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
