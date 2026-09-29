import { NextResponse } from "next/server";
import { requireAdmin } from "../_auth";
import { getAdminEmails } from "@/lib/admin-auth";

/**
 * GET /api/admin/check — pemeriksaan ringan apakah user login adalah admin.
 * Dipakai layout admin (client) untuk redirect non-admin ke "/".
 * isSuperAdmin bernilai true jika email user ada di env ADMIN_EMAILS.
 */
export async function GET() {
  const { response, user } = await requireAdmin();
  if (response) return response;

  const email = (user?.email ?? "").trim().toLowerCase();
  const isSuperAdmin = email.length > 0 && getAdminEmails().includes(email);

  return NextResponse.json({
    success: true,
    isAdmin: true,
    isSuperAdmin,
    userId: user?.id,
  });
}