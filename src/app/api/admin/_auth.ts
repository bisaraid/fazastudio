import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { getAdminEmails } from "@/lib/admin-auth";

/**
 * Auth helper bersama untuk semua endpoint /api/admin.
 * Replikasi logika yang sama dengan /api/admin/stats (jangan diubah di sana).
 *  - Belum login              → response 401
 *  - Login tapi bukan admin   → response 403
 *  - Admin                    → response null (lanjut handle request)
 */
export interface SessionUser {
  id: string;
  email?: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return { id: user.id, email: user.email ?? null };
  } catch (e) {
    console.warn("[admin] getSessionUser gagal:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Cek admin dari DB (is_admin) atau bootstrap env ADMIN_EMAILS + auto-promote. */
export async function isAdminUser(userId: string, email?: string | null): Promise<boolean> {
  const service = createServiceRoleClient();

  // 1) Cek flag is_admin di DB.
  const { data: profile } = await service
    .from("profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (profile?.is_admin) return true;

  // 2) Bootstrap: email di ADMIN_EMAILS → auto-promote (idempoten).
  const emailLower = (email || "").trim().toLowerCase();
  if (emailLower && getAdminEmails().includes(emailLower)) {
    try {
      await service
        .from("profiles")
        .upsert(
          { user_id: userId, is_admin: true, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
    } catch (e) {
      console.warn("[admin] auto-promote gagal:", e instanceof Error ? e.message : e);
    }
    return true;
  }

  return false;
}

/** Pastikan caller ter-autentikasi sekaligus admin. */
export async function requireAdmin(): Promise<{
  user: SessionUser | null;
  response: NextResponse | null;
}> {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { success: false, error: "Silakan masuk terlebih dahulu" },
        { status: 401 }
      ),
    };
  }

  const admin = await isAdminUser(user.id, user.email);
  if (!admin) {
    return {
      user,
      response: NextResponse.json(
        { success: false, error: "Akun ini tidak memiliki akses admin" },
        { status: 403 }
      ),
    };
  }

  return { user, response: null };
}