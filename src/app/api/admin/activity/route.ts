import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { mergeActivity, type AuditLogRow, type ProjectRow } from "@/lib/admin-activity";
import { requireAdmin } from "../_auth";

/**
 * GET /api/admin/activity?limit=10 — Activity feed admin.
 *
 * Gabungan dari:
 *   - admin_audit_logs (migration 027): aksi admin (plan/admin/harvest)
 *   - projects: project terbaru
 *
 * DEFENSIF: kalau tabel audit belum ada, endpoint tetap 200 dengan
 * auditReady=false dan hanya berisi project terbaru.
 */

export async function GET(request: NextRequest) {
  const { response: unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const params = request.nextUrl.searchParams;
  const limit = Math.min(50, Math.max(1, parseInt(params.get("limit") ?? "10", 10) || 10));

  const supabase = createServiceRoleClient();
  let audit: AuditLogRow[] = [];
  let projects: ProjectRow[] = [];
  let auditReady = true;

  try {
    const { data, error } = await supabase
      .from("admin_audit_logs")
      .select("id,action,subject_email,payload,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      auditReady = false;
      console.warn("[admin-activity] audit query gagal:", error.message);
    } else {
      audit = (data ?? []) as AuditLogRow[];
    }
  } catch (e) {
    auditReady = false;
    console.warn("[admin-activity] audit exception:", e instanceof Error ? e.message : e);
  }

  try {
    const { data, error } = await supabase
      .from("projects")
      .select("id,title,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[admin-activity] projects query gagal:", error.message);
    } else {
      projects = (data ?? []) as ProjectRow[];
    }
  } catch (e) {
    console.warn("[admin-activity] projects exception:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    success: true,
    data: {
      items: mergeActivity(audit, projects, limit),
      auditReady,
      limit,
      generatedAt: new Date().toISOString(),
    },
  });
}
