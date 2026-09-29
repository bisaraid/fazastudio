"use client";

import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Folder,
  CheckCircle2,
  Users,
  BadgeCheck,
  FileText,
  TrendingUp,
} from "lucide-react";

interface AdminStats {
  projects: { total: number; last7d: number; completed: number };
  usage: { rows: number; free: number; starter: number; pro: number };
  profiles: { total: number };
  trends: { total: number; lastFetched: string | null };
  scriptGenerations: { total: number; last7d: number };
  generatedAt: string;
}

function fmtNum(n: number): string {
  return (n ?? 0).toLocaleString("id-ID");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID");
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
}

function StatCard({ label, value, sub, icon: Icon }: StatCardProps) {
  return (
    <div className="relative rounded-xl border bg-card p-5">
      <Icon className="absolute right-4 top-4 h-5 w-5 text-primary/50" />
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function OverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const loadStats = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats");
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || `HTTP ${res.status}`);
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

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const paid = (stats?.usage?.starter ?? 0) + (stats?.usage?.pro ?? 0);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Statistik operasional platform Anda.
      </p>

      {fetching && <p className="mt-6 text-sm text-muted-foreground">Memuat statistik...</p>}

      {!fetching && error && (
        <p className="mt-6 text-sm text-destructive">{error}</p>
      )}

      {stats && !error && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Total Project"
            value={fmtNum(stats.projects.total)}
            sub={`${fmtNum(stats.projects.last7d)} 7 hari terakhir`}
            icon={Folder}
          />
          <StatCard
            label="Project Selesai"
            value={fmtNum(stats.projects.completed)}
            icon={CheckCircle2}
          />
          <StatCard
            label="Total User"
            value={fmtNum(stats.profiles.total)}
            icon={Users}
          />
          <StatCard
            label="Paid Users"
            value={fmtNum(paid)}
            sub="Starter + Pro"
            icon={BadgeCheck}
          />
          <StatCard
            label="Script Generated"
            value={fmtNum(stats.scriptGenerations.total)}
            sub={`${fmtNum(stats.scriptGenerations.last7d)} 7 hari`}
            icon={FileText}
          />
          <StatCard
            label="Trend Ideas"
            value={fmtNum(stats.trends.total)}
            sub={`Sinkron ${fmtDate(stats.trends.lastFetched)}`}
            icon={TrendingUp}
          />
        </div>
      )}

      {stats && (
        <p className="mt-6 text-[11px] text-muted-foreground">
          Data generated: {new Date(stats.generatedAt).toLocaleString("id-ID")}
        </p>
      )}
    </div>
  );
}