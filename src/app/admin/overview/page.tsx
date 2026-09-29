"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users as UsersIcon,
  Folder,
  FileText,
  BadgeCheck,
  Activity,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { adminCachedFetch } from "@/lib/admin-cache";
import DeltaBadge from "@/components/admin/delta-badge";
import dynamic from "next/dynamic";
import type { AdminDeltas } from "@/lib/admin-delta";

/**
 * Chart hanya dipakai halaman overview dan dimuat LAZY (ssr:false), jadi
 * kodenya jadi chunk terpisah dan tidak menambah bundle awal halaman admin.
 */
const GrowthChart = dynamic(() => import("@/components/admin/growth-chart"), {
  ssr: false,
  loading: () => <div className="mt-6 h-[280px] animate-pulse rounded-xl bg-muted/40" />,
});

interface AdminStats {
  projects: { total: number; last7d: number; completed: number };
  usage: { rows: number; free: number; starter: number; pro: number };
  profiles: { total: number };
  trends: { total: number; lastFetched: string | null };
  scriptGenerations: { total: number; last7d: number };
  /** Pembanding 7d vs 7d sebelumnya. null = perhitungan gagal → UI "—". */
  deltas?: AdminDeltas | null;
  generatedAt: string;
}

interface AdminUserRow {
  userId: string;
  email: string;
  plan: "free" | "starter" | "pro";
  createdAt: string;
}

function fmtNum(n: number): string {
  return (n ?? 0).toLocaleString("id-ID");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Waktu relatif pendek, mis. "14 menit lalu". */
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec} detik lalu`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  return `${days} hari lalu`;
}

/** Normal jika harvest terakhir < 7 jam lalu. */
function harvestOk(lastFetched: string | null): boolean {
  if (!lastFetched) return false;
  return Date.now() - new Date(lastFetched).getTime() < 7 * 60 * 60 * 1000;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  const load = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const json = await adminCachedFetch<{
        success?: boolean;
        error?: string;
        data?: AdminStats;
      }>("admin:overview:stats", "/api/admin/stats");
      if (!json?.success) {
        setError(json?.error || "Gagal memuat statistik");
        setStats(null);
        return;
      }
      setStats(json.data as AdminStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan jaringan");
      setStats(null);
    } finally {
      setFetching(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const json = await adminCachedFetch<{
        success?: boolean;
        data?: AdminUserRow[];
      }>("admin:overview:users", "/api/admin/users");
      if (json?.success) setUsers(json.data as AdminUserRow[]);
    } catch {
      /* abaikan */
    }
  }, []);

  useEffect(() => {
    void Promise.all([load(), loadUsers()]);
  }, [load, loadUsers]);

  const paid = (stats?.usage?.starter ?? 0) + (stats?.usage?.pro ?? 0);
  const ok = harvestOk(stats?.trends?.lastFetched ?? null);
  const pctFree = stats && stats.usage.rows > 0
    ? Math.round((stats.usage.free / stats.usage.rows) * 100)
    : 0;
  const pctPaid = stats && stats.usage.rows > 0 ? 100 - pctFree : 0;

  const latestUsers = useMemo(() => users.slice(0, 5), [users]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gambaran umum platform Anda.
      </p>

      {fetching && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="h-32 animate-pulse rounded-xl bg-muted/40" />
            <div className="h-32 animate-pulse rounded-xl bg-muted/40" />
            <div className="h-32 animate-pulse rounded-xl bg-muted/40" />
            <div className="h-32 animate-pulse rounded-xl bg-muted/40" />
          </div>
        )}
      {error && !fetching && <p className="mt-6 text-sm text-destructive">{error}</p>}

      {stats && !error && (
        <>
          {/* ROW 1 — 4 stat card */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative rounded-xl border bg-card p-5">
              <UsersIcon className="absolute right-4 top-4 h-5 w-5 text-primary/50" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total User</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{fmtNum(stats.profiles.total)}</p>
              <DeltaBadge metric={stats.deltas?.newUsers} label="User baru" />
            </div>
            <div className="relative rounded-xl border bg-card p-5">
              <Folder className="absolute right-4 top-4 h-5 w-5 text-primary/50" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Project</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{fmtNum(stats.projects.total)}</p>
              <DeltaBadge metric={stats.deltas?.newProjects} label="Project baru" />
            </div>
            <div className="relative rounded-xl border bg-card p-5">
              <FileText className="absolute right-4 top-4 h-5 w-5 text-primary/50" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Script 7 Hari</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{fmtNum(stats.scriptGenerations.last7d)}</p>
              <DeltaBadge metric={stats.deltas?.newScripts} label="Script baru" />
            </div>
            <div className="relative rounded-xl border bg-card p-5">
              <BadgeCheck className="absolute right-4 top-4 h-5 w-5 text-primary/50" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid Users</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{fmtNum(paid)}</p>
            </div>
          </div>
          <GrowthChart days={30} />



          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <div className="rounded-xl border bg-card p-5 lg:col-span-3">
              <h2 className="text-sm font-semibold tracking-tight">
                Aktivitas 7 Hari Terakhir
              </h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Folder className="h-4 w-4 text-primary/50" />
                    Project baru
                  </span>
                  <span className="font-semibold tabular-nums">
                    {fmtNum(stats.projects.last7d)}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-4 w-4 text-primary/50" />
                    Script dibuat
                  </span>
                  <span className="font-semibold tabular-nums">
                    {fmtNum(stats.scriptGenerations.last7d)}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp className="h-4 w-4 text-primary/50" />
                    Trend ideas terkumpul
                  </span>
                  <span className="font-semibold tabular-nums">
                    {fmtNum(stats.trends.total)}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Activity className="h-4 w-4 text-primary/50" />
                    Harvest terakhir
                  </span>
                  <span className="text-muted-foreground">
                    {timeAgo(stats.trends.lastFetched)}
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border bg-card p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold tracking-tight">Status Sistem</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Harvest</span>
                  <span className={ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                    {ok ? "✅ Normal" : "⚠️ Perlu perhatian"}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Trend Ideas</span>
                  <span className="font-semibold tabular-nums">
                    {fmtNum(stats.trends.total)} topik aktif
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">Midtrans</span>
                  <span className="text-amber-600 dark:text-amber-400">⚠️ Belum aktif</span>
                </li>
              </ul>
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">Plan distribution</p>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-primary/20"
                    style={{ width: `${Math.max(0, Math.min(100, pctFree))}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Free {pctFree}%</span>
                  <span>Paid {pctPaid}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border bg-card">
            <div className="px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight">User Terbaru</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Avatar</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Bergabung</th>
                  </tr>
                </thead>
                <tbody>
                  {latestUsers.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        Belum ada user.
                      </td>
                    </tr>
                  )}
                  {latestUsers.map((u) => (
                    <tr key={u.userId} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold">
                          {(u.email.trim().charAt(0) || "?").toUpperCase()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-xs">{u.plan}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {fmtDate(u.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3">
              <Link
                href="/admin/users"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Lihat semua
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}