/**
 * Admin metrics — snapshot harian + backfill (historis).
 * Hanya server-side (service role). Migration 026.
 *
 * - recordAdminMetricsDay(): upsert baris hari ini (hitungan real-time).
 * - backfillAdminMetrics(): dijalankan sekali, idempoten, membuat riwayat 30 hari
 *   dari created_at. Baris hasil ditandai is_estimated=true karena data yang
 *   sudah dihapus tidak terhitung (nilai perkiraan).
 */

import { createServiceRoleClient } from "./supabase/service";

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentPeriod(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${m}`;
}

function parseDateKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function nextDayKey(k: string): string {
  const dt = parseDateKey(k);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

interface DailyCounts {
  totalUsers: number;
  totalProjects: number;
  totalScripts: number;
  totalTrends: number;
  paidUsers: number;
}

async function countTable(table: string): Promise<number> {
  try {
    const supabase = createServiceRoleClient();
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  } catch (e) {
    console.warn(
      `[admin-snapshot] count ${table} gagal:`,
      e instanceof Error ? e.message : e
    );
    return 0;
  }
}

async function countAuthUsers(): Promise<number> {
  try {
    const supabase = createServiceRoleClient();
    let page = 1;
    let total = 0;
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) break;
      const users = data?.users ?? [];
      if (users.length === 0) break;
      total += users.filter((u) => !u.is_anonymous).length;
      if (users.length < 1000) break;
      page++;
    }
    return total;
  } catch (e) {
    console.warn(
      "[admin-snapshot] countAuthUsers gagal:",
      e instanceof Error ? e.message : e
    );
    return 0;
  }
}

async function countPaidUsers(): Promise<number> {
  try {
    const supabase = createServiceRoleClient();
    const { count } = await supabase
      .from("user_usage")
      .select("id", { count: "exact", head: true })
      .eq("period", currentPeriod())
      .in("plan", ["starter", "pro"]);
    return count ?? 0;
  } catch (e) {
    console.warn(
      "[admin-snapshot] countPaidUsers gagal:",
      e instanceof Error ? e.message : e
    );
    return 0;
  }
}

async function getTodayCounts(): Promise<DailyCounts> {
  return {
    totalUsers: await countAuthUsers(),
    totalProjects: await countTable("projects"),
    totalScripts: await countTable("script_generations"),
    totalTrends: await countTable("trend_ideas"),
    paidUsers: await countPaidUsers(),
  };
}

/** Snapshot hari ini, real-time. Idempoten (upsert onConflict: date). */
export async function recordAdminMetricsDay(): Promise<boolean> {
  try {
    const counts = await getTodayCounts();
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("admin_metrics_daily").upsert(
      {
        date: todayKey(),
        total_users: counts.totalUsers,
        total_projects: counts.totalProjects,
        total_scripts: counts.totalScripts,
        total_trends: counts.totalTrends,
        paid_users: counts.paidUsers,
        is_estimated: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date" }
    );
    return !error;
  } catch (e) {
    console.warn(
      "[admin-snapshot] recordAdminMetricsDay gagal:",
      e instanceof Error ? e.message : e
    );
    return false;
  }
}

async function bucketTableDate(table: string, col: string): Promise<Map<string, number>> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from(table).select(col);
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = typeof r[col] === "string" ? (r[col] as string) : null;
    const k = dayKey(v);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

async function bucketAuthUsers(): Promise<Map<string, number>> {
  const supabase = createServiceRoleClient();
  const map = new Map<string, number>();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) break;
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      if (u.is_anonymous) continue;
      const k = dayKey(u.created_at);
      if (k) map.set(k, (map.get(k) ?? 0) + 1);
    }
    if (users.length < 1000) break;
    page++;
  }
  return map;
}

/** Backfill idempoten: upsert baris 30 hari (is_estimated=true) dari created_at. */
export async function backfillAdminMetrics(opts?: { days?: number; dryRun?: boolean }): Promise<{
  dryRun: boolean;
  written: number;
  plannedRows: number;
  from: string;
  to: string;
}> {
  const dryRun = Boolean(opts?.dryRun);
  const days = Math.max(1, opts?.days ?? 30);
  const to = todayKey();
  const from = new Date(Date.now() - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);

  const usersB = await bucketAuthUsers();
  const projB = await bucketTableDate("projects", "created_at");
  const scriptB = await bucketTableDate("script_generations", "created_at");
  const trendB = await bucketTableDate("trend_ideas", "fetched_at");

  let plannedRows = 0;
  let written = 0;
  for (let d = from; d <= to; d = nextDayKey(d)) {
    let totalUsers = 0;
    let totalProjects = 0;
    let totalScripts = 0;
    let totalTrends = 0;
    for (const [k, v] of Array.from(usersB.entries())) if (k <= d) totalUsers += v;
    for (const [k, v] of Array.from(projB.entries())) if (k <= d) totalProjects += v;
    for (const [k, v] of Array.from(scriptB.entries())) if (k <= d) totalScripts += v;
    for (const [k, v] of Array.from(trendB.entries())) if (k <= d) totalTrends += v;

    plannedRows++;
    if (dryRun) continue;

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("admin_metrics_daily").upsert(
      {
        date: d,
        total_users: totalUsers,
        total_projects: totalProjects,
        total_scripts: totalScripts,
        total_trends: totalTrends,
        paid_users: 0,
        is_estimated: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date" }
    );
    if (!error) written++;
  }

  return { dryRun, written, plannedRows, from, to };
}