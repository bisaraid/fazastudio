/**
 * Admin delta% — 7 hari terakhir vs 7 hari sebelumnya.
 * Hanya server-side (service role). Dipakai oleh /api/admin/stats.
 *
 * Aturan baseline kosong (tidak pernah menghasilkan NaN/Infinity):
 *  - previous = 0, current = 0 → pct null, direction "flat" → UI menampilkan "—"
 *  - previous = 0, current > 0 → pct null, direction "up"   → UI menampilkan "Baru"
 *  - selain itu                → pct dibulatkan (bisa negatif)
 *
 * Catatan: delta dihitung REAL-TIME dari created_at, jadi tidak bergantung pada
 * tabel snapshot admin_metrics_daily (tetap akurat walau backfill belum jalan).
 */

import { createServiceRoleClient } from "@/lib/supabase/service";

export type DeltaDirection = "up" | "down" | "flat";

export interface DeltaMetric {
  /** jumlah dalam 7 hari terakhir */
  current: number;
  /** jumlah dalam 7 hari sebelumnya */
  previous: number;
  /** null = baseline kosong (tidak ada pembanding yang valid) */
  pct: number | null;
  direction: DeltaDirection;
}

export interface AdminDeltas {
  window: {
    currentFrom: string;
    currentTo: string;
    previousFrom: string;
  };
  newUsers: DeltaMetric;
  newProjects: DeltaMetric;
  newScripts: DeltaMetric;
  generatedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;

function emptyMetric(): DeltaMetric {
  return { current: 0, previous: 0, pct: null, direction: "flat" };
}

/** Murni & deterministik — dipakai unit test. Anti NaN/Infinity. */
export function buildDeltaMetric(current: number, previous: number): DeltaMetric {
  const c = Number.isFinite(current) && current > 0 ? Math.trunc(current) : 0;
  const p = Number.isFinite(previous) && previous > 0 ? Math.trunc(previous) : 0;

  if (p === 0) {
    return c > 0
      ? { current: c, previous: 0, pct: null, direction: "up" }
      : emptyMetric();
  }

  const raw = ((c - p) / p) * 100;
  if (!Number.isFinite(raw)) return { current: c, previous: p, pct: null, direction: "flat" };

  const pct = Math.round(raw);
  const direction: DeltaDirection = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return { current: c, previous: p, pct, direction };
}

/**
 * Jumlah baris tabel dengan created_at di dalam window.
 * `inclusiveEnd: true`  → [from, to]   (dipakai window 7 hari terakhir)
 * `inclusiveEnd: false` → [from, to)   (dipakai window sebelumnya)
 */
async function countCreatedBetween(
  table: string,
  fromIso: string,
  toIso: string,
  inclusiveEnd = true
): Promise<number> {
  try {
    const supabase = createServiceRoleClient();
    const base = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .gte("created_at", fromIso);
    const { count } = await (inclusiveEnd
      ? base.lte("created_at", toIso)
      : base.lt("created_at", toIso));
    return count ?? 0;
  } catch (e) {
    console.warn(
      `[admin-delta] count ${table} gagal:`,
      e instanceof Error ? e.message : e
    );
    return 0;
  }
}

/**
 * User baru (non-anonymous) untuk kedua window dalam satu kali penelusuran
 * paginasi listUsers — supaya tidak dua kali bolak-balik ke Auth API.
 *
 * Batas window: [previousFrom, mid) dan [mid, currentTo].
 * Baris tepat di `mid` masuk window TERBARU — konsisten dengan hitungan tabel
 * (lte/lte) supaya tidak ada baris yang terhitung dua kali.
 */
async function countNewAuthUsers(fromIso: string, midIso: string, toIso: string): Promise<{
  previous: number;
  current: number;
}> {
  try {
    const supabase = createServiceRoleClient();
    const from = new Date(fromIso).getTime();
    const mid = new Date(midIso).getTime();
    const to = new Date(toIso).getTime();

    let page = 1;
    let previous = 0;
    let current = 0;
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      const users = data?.users ?? [];
      if (users.length === 0) break;
      for (const u of users) {
        if (u.is_anonymous) continue;
        const t = u.created_at ? new Date(u.created_at).getTime() : NaN;
        if (!Number.isFinite(t)) continue;
        if (t >= mid && t <= to) current++;
        else if (t >= from && t < mid) previous++;
      }
      if (users.length < 1000) break;
      page++;
    }
    return { previous, current };
  } catch (e) {
    console.warn(
      "[admin-delta] countNewAuthUsers gagal:",
      e instanceof Error ? e.message : e
    );
    return { previous: 0, current: 0 };
  }
}

/** Batas window perbandingan. Murni (dipakai juga oleh unit test). */
export function deltaWindow(nowMs: number): {
  currentFrom: string;
  currentTo: string;
  previousFrom: string;
} {
  const at = Number.isFinite(nowMs) ? nowMs : Date.now();
  return {
    currentFrom: new Date(at - WINDOW_DAYS * DAY_MS).toISOString(),
    currentTo: new Date(at).toISOString(),
    previousFrom: new Date(at - 2 * WINDOW_DAYS * DAY_MS).toISOString(),
  };
}

/** Isi mentah tiap metrik: jumlah window sekarang & sebelumnya. */
export interface DeltaCounts {
  newUsers: { current: number; previous: number };
  newProjects: { current: number; previous: number };
  newScripts: { current: number; previous: number };
}

/** Rakit hasil akhir dari angka mentah. Murni — tidak menyentuh jaringan. */
export function assembleAdminDeltas(
  counts: DeltaCounts,
  window: AdminDeltas["window"],
  generatedAt: string
): AdminDeltas {
  return {
    window,
    newUsers: buildDeltaMetric(counts.newUsers.current, counts.newUsers.previous),
    newProjects: buildDeltaMetric(counts.newProjects.current, counts.newProjects.previous),
    newScripts: buildDeltaMetric(counts.newScripts.current, counts.newScripts.previous),
    generatedAt,
  };
}

/** Delta lengkap untuk stat card overview. Semua cabang defensif (tidak throw). */
export async function computeAdminDeltas(): Promise<AdminDeltas> {
  const win = deltaWindow(Date.now());

  const [projectsCur, projectsPrev, scriptsCur, scriptsPrev, users] = await Promise.all([
    countCreatedBetween("projects", win.currentFrom, win.currentTo),
    countCreatedBetween("projects", win.previousFrom, win.currentFrom, false),
    countCreatedBetween("script_generations", win.currentFrom, win.currentTo),
    countCreatedBetween("script_generations", win.previousFrom, win.currentFrom, false),
    countNewAuthUsers(win.previousFrom, win.currentFrom, win.currentTo),
  ]);

  return assembleAdminDeltas(
    {
      newUsers: users,
      newProjects: { current: projectsCur, previous: projectsPrev },
      newScripts: { current: scriptsCur, previous: scriptsPrev },
    },
    win,
    new Date().toISOString()
  );
}