import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getServerIdentity, deviceCookieOptions, DEVICE_ID_COOKIE } from "@/lib/identity";

export async function GET(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const identity = getServerIdentity(request);
    const identityKey = identity.identityKey;

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

    const res = NextResponse.json({ success: true, data: data || [] });
    if (identity.isNew) {
      res.cookies.set(DEVICE_ID_COOKIE, identity.deviceId, deviceCookieOptions());
    }
    return res;
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
    const identity = getServerIdentity(request);
    const identityKey = identity.identityKey;

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
        genre_slug: body.genre || null,
        platform: body.platform || null,
        target_duration: body.targetDuration ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[projects] POST error:", error);
      return NextResponse.json({ success: false, error: "Gagal menyimpan project" }, { status: 500 });
    }

    const res = NextResponse.json({ success: true, data });
    if (identity.isNew) {
      res.cookies.set(DEVICE_ID_COOKIE, identity.deviceId, deviceCookieOptions());
    }
    return res;
  } catch (error) {
    console.error("[projects] POST error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const projectId = request.nextUrl.searchParams.get("id");
    if (!projectId || projectId.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Parameter id wajib diisi" },
        { status: 400 }
      );
    }

    const identity = getServerIdentity(request);
    const identityKey = identity.identityKey;

    const supabase = createServiceRoleClient();
    // Hapus hanya project milik identity caller — cegah hapus punya orang lain.
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("identity_key", identityKey);

    if (error) {
      console.error("[projects] DELETE error:", error);
      return NextResponse.json(
        { success: false, error: "Gagal menghapus project" },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ success: true });
    if (identity.isNew) {
      res.cookies.set(DEVICE_ID_COOKIE, identity.deviceId, deviceCookieOptions());
    }
    return res;
  } catch (error) {
    console.error("[projects] DELETE error:", error);
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
    const { projectId } = body;

    // Validasi field wajib
    if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Field projectId wajib diisi" },
        { status: 400 }
      );
    }

    // Build update payload — hanya field yang disediakan (opsional)
    const updates: Record<string, unknown> = {};

    // Field setup konten (opsional)
    if (body.genre !== undefined) updates.genre_slug = body.genre;
    if (body.platform !== undefined) updates.platform = body.platform;
    if (body.targetDuration !== undefined) updates.target_duration = body.targetDuration;
    // Judul project (dari topic — agar kartu menampilkan judul)
    if (body.title !== undefined) updates.title = body.title;
    // Status project (mis. "completed" saat video selesai)
    if (body.status !== undefined) updates.status = body.status;

    // Field script (opsional — backward compat)
    if (body.script !== undefined) updates.script = JSON.stringify(body.script);

    // Tidak ada field yang diupdate
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: "Tidak ada field yang bisa diupdate" },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const supabase = createServiceRoleClient();

    // Update kolom yang disediakan + updated_at
    const { error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", projectId);

    if (error) {
      console.error("[projects] PATCH error:", error);
      return NextResponse.json({ success: false, error: "Gagal mengupdate project" }, { status: 500 });
    }

    console.log(`[Update] Persist project field: ${projectId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[projects] PATCH error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
