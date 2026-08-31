import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * POST /api/behavior — catat sinyal perilaku user (mis. tombol "Ulangi").
 *
 * FIRE-AND-FORGET oleh desain:
 * - SELALU mengembalikan 201/200, tidak pernah error ke client.
 * - Tidak menunggu/lanjut; caller TIDAK boleh bergantung pada hasil API ini
 *   untuk melanjutkan proses generate.
 * - Semua kegagalan dicatat ke console saja (server-side).
 */
export async function POST(request: NextRequest) {
  // Identifikasi user login (best-effort; anonim → tetap 200 tanpa menulis).
  let userId: string | null = null;
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch (e) {
    console.warn("[behavior] gagal baca sesi (diabaikan):", (e as Error)?.message);
  }

  if (!userId) {
    return NextResponse.json({ success: true, recorded: false }, { status: 200 });
  }

  let eventType = "";
  let projectId: string | null = null;
  try {
    const body = await request.json();
    eventType = typeof body?.eventType === "string" ? body.eventType : "";
    projectId = typeof body?.projectId === "string" ? body.projectId : null;
  } catch {
    eventType = "";
  }

  if (!eventType) {
    return NextResponse.json({ success: true, recorded: false }, { status: 200 });
  }

  // Insert best-effort via service role (bypass RLS). Jangan sampai throw.
  try {
    const svc = createServiceRoleClient();
    await svc.from("behavior_events").insert({
      user_id: userId,
      project_id: projectId,
      event_type: eventType,
    });
  } catch (e) {
    // Hanya log; user tidak perlu tahu. Tidak menghentikan apapun.
    console.error("[behavior] insert gagal (diabaikan):", (e as Error)?.message);
  }

  return NextResponse.json({ success: true, recorded: true }, { status: 201 });
}