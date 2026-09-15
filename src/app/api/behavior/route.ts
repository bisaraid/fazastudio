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
  let value: Record<string, unknown> | null = null;
  try {
    const body = await request.json();
    eventType = typeof body?.eventType === "string" ? body.eventType : "";
    projectId = typeof body?.projectId === "string" ? body.projectId : null;
    // value opsional (jsonb). Hanya dipakai bila merupakan objek plain (bukan array/null).
    if (body?.value && typeof body.value === "object" && !Array.isArray(body.value)) {
      const v: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(body.value as Record<string, unknown>)) {
        if (typeof k === "string") v[k] = val;
      }
      if (Object.keys(v).length > 0) value = v;
    }
  } catch {
    eventType = "";
  }

  if (!eventType) {
    return NextResponse.json({ success: true, recorded: false }, { status: 200 });
  }

  // Insert best-effort via service role (bypass RLS). Jangan sampai throw.
  try {
    const svc = createServiceRoleClient();
    // Retro-compat: kalau tidak ada value → biarkan kolom null (tidak diset).
    const insert: Record<string, unknown> = {
      user_id: userId,
      project_id: projectId,
      event_type: eventType,
    };
    if (value) insert.value = value;
    await svc.from("behavior_events").insert(insert);
  } catch (e) {
    // Hanya log; user tidak perlu tahu. Tidak menghentikan apapun.
    console.error("[behavior] insert gagal (diabaikan):", (e as Error)?.message);
  }

  return NextResponse.json({ success: true, recorded: true }, { status: 201 });
}