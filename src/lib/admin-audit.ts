/**
 * Admin audit log — best-effort, tanpa data sensitif.
 * Migration 027. Email di-redact (a***@x.com).
 */

import { createServiceRoleClient } from "./supabase/service";

export interface AdminAuditInput {
  actorUserId: string;
  action: string; // 'set_plan' | 'set_admin' | 'trigger_trends'
  subjectUserId?: string | null;
  subjectEmail?: string | null;
  payload?: Record<string, unknown>;
}

function redactEmail(email: string): string {
  const idx = email.indexOf("@");
  if (idx <= 0) return email;
  const local = email.slice(0, idx);
  const domain = email.slice(idx);
  const safe = local.length > 2 ? `${local.slice(0, 2)}***` : `${local.charAt(0)}***`;
  return `${safe}${domain}`;
}

export async function recordAudit(input: AdminAuditInput): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("admin_audit_logs").insert({
      actor_user_id: input.actorUserId,
      action: input.action,
      subject_user_id: input.subjectUserId ?? null,
      subject_email: input.subjectEmail ? redactEmail(input.subjectEmail) : null,
      payload: input.payload ?? {},
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.warn("[admin-audit] insert gagal:", error.message);
    }
    return !error;
  } catch (e) {
    console.warn("[admin-audit] recordAudit gagal:", e instanceof Error ? e.message : e);
    return false;
  }
}