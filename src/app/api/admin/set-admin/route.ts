import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireAdmin } from "../_auth";

/**
 * POST /api/admin/set-admin — promote/demote admin di tabel profiles.
 * Body: { userId: string, isAdmin: boolean }
 * Proteksi: tidak boleh mencabut akses admin dari diri sendiri.
 */
export async function POST(request: NextRequest) {
  const { user, response: unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Body tidak valid" },
      { status: 400 }
    );
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const isAdmin = body.isAdmin;

  if (!userId || typeof isAdmin !== "boolean") {
    return NextResponse.json(
      { success: false, error: "Parameter tidak valid" },
      { status: 400 }
    );
  }

  if (isAdmin === false && userId === user?.id) {
    return NextResponse.json(
      { success: false, error: "Tidak bisa mencabut akses admin dari diri sendiri" },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      is_admin: isAdmin,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.warn("[admin-set-admin] upsert gagal:", error.message);
    return NextResponse.json(
      { success: false, error: "Gagal memperbarui status admin" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, userId, isAdmin });
}