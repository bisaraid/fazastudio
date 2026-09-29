/**
 * Activity feed admin — gabungan audit log (migration 027) + project terbaru.
 * Semua fungsi di sini MURNI; komponen hanya menampilkan hasilnya.
 */

export type ActivityKind = "audit" | "project";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** Judul singkat yang sudah ramah dibaca. */
  title: string;
  /** Keterangan tambahan (opsional), mis. "a***@x.com — free → pro". */
  detail?: string;
  /** ISO timestamp. */
  at: string;
}

export interface AuditLogRow {
  id: string;
  action: string;
  subject_email?: string | null;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface ProjectRow {
  id: string;
  title?: string | null;
  created_at?: string | null;
}

/** Label ramah untuk aksi audit yang dikenal. */
export const ACTION_LABEL: Record<string, string> = {
  set_plan: "Ubah plan user",
  set_admin: "Ubah akses admin",
  trigger_trends: "Picu harvest tren",
};

function safeAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Ubah payload audit jadi kalimat pendek (mis. "free → pro"). */
export function describeAuditDetail(row: AuditLogRow): string | undefined {
  const parts: string[] = [];
  if (row.subject_email) parts.push(row.subject_email);

  const p = row.payload ?? {};
  const plan = typeof p.plan === "string" ? p.plan : null;
  const prev = typeof p.previousPlan === "string" ? p.previousPlan : null;
  if (plan) parts.push(prev ? `${prev} → ${plan}` : `plan ${plan}`);

  if (typeof p.isAdmin === "boolean") parts.push(p.isAdmin ? "jadikan admin" : "cabut admin");
  if (typeof p.count === "number") parts.push(`${p.count} item`);

  return parts.length ? parts.join(" — ") : undefined;
}

export function auditToItem(row: AuditLogRow): ActivityItem | null {
  const at = safeAt(row.created_at);
  if (!at) return null;
  return {
    id: `audit:${row.id}`,
    kind: "audit",
    title: ACTION_LABEL[row.action] ?? row.action,
    detail: describeAuditDetail(row),
    at,
  };
}

export function projectToItem(row: ProjectRow): ActivityItem | null {
  const at = safeAt(row.created_at);
  if (!at) return null;
  const title = (row.title ?? "").trim();
  return {
    id: `project:${row.id}`,
    kind: "project",
    title: title ? `Project baru: ${title}` : "Project baru dibuat",
    at,
  };
}

/**
 * Gabungkan audit + project, urutkan terbaru dulu, ambil `limit` item.
 * Baris tanpa timestamp valid diabaikan (tidak menampilkan "—" yang membingungkan).
 */
export function mergeActivity(
  audit: AuditLogRow[] | null | undefined,
  projects: ProjectRow[] | null | undefined,
  limit = 10
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const r of audit ?? []) {
    const it = auditToItem(r);
    if (it) items.push(it);
  }
  for (const r of projects ?? []) {
    const it = projectToItem(r);
    if (it) items.push(it);
  }
  items.sort((a, b) => b.at.localeCompare(a.at));
  const n = Math.max(0, Math.trunc(limit));
  return items.slice(0, n);
}
