"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { useUser } from "@/hooks/useUser";

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

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const { user, loading } = useUser();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const loadStats = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats"); // sesi via cookie, tanpa header manual
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || `HTTP ${res.status}`);
        setStats(null);
        return;
      }
      setStats(json.data as AdminStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setStats(null);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user && !loading) void loadStats();
  }, [user, loading, loadStats]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Statistik operasional — hanya untuk akun terdaftar dengan akses admin.
            </p>
          </div>
        </div>

        {loading && <p className="mt-8 text-sm text-muted-foreground">Memeriksa sesi...</p>}

        {!loading && !user && (
          <div className="mt-8 rounded-xl border p-6 text-center">
            <h2 className="text-lg font-semibold">Masuk dulu yuk</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Dashboard admin menggunakan akun yang terdaftar. Silakan masuk lalu buka lagi halaman ini.
            </p>
            <Link
              href="/masuk"
              className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Masuk
            </Link>
          </div>
        )}

        {!loading && user && fetching && (
          <p className="mt-6 text-sm text-muted-foreground">Memuat statistik...</p>
        )}

        {!loading && user && error && !fetching && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <p className="font-semibold">Akses terbatas</p>
            <p className="mt-1">{error}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Jika Anda admin, pastikan akun sudah di-promote (ADMIN_EMAILS) atau hubungi super admin.
            </p>
          </div>
        )}

        {user && stats && !fetching && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card label="Total Project" value={fmtNum(stats.projects.total)} sub={`${fmtNum(stats.projects.last7d)} 7 hari terakhir`} />
            <Card label="Project Selesai" value={fmtNum(stats.projects.completed)} />
            <Card label="User (Profiles)" value={fmtNum(stats.profiles.total)} />
            <Card label="Script Generated" value={fmtNum(stats.scriptGenerations.total)} sub={`${fmtNum(stats.scriptGenerations.last7d)} 7 hari`} />
            <Card label="Trend Ideas" value={fmtNum(stats.trends.total)} sub={`Sinkron ${fmtDate(stats.trends.lastFetched)}`} />
            <div className="rounded-xl border bg-muted/30 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plan Kredit (rows)</p>
              <div className="mt-2 flex items-center gap-3 text-sm tabular-nums">
                <span>Free {fmtNum(stats.usage.free)}</span>
                <span className="text-muted-foreground">·</span>
                <span>Starter {fmtNum(stats.usage.starter)}</span>
                <span className="text-muted-foreground">·</span>
                <span>Pro {fmtNum(stats.usage.pro)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Total rows: {fmtNum(stats.usage.rows)}</p>
            </div>
          </div>
        )}

        {stats && (
          <p className="mt-6 text-[11px] text-muted-foreground">
            Data generated: {new Date(stats.generatedAt).toLocaleString("id-ID")}
          </p>
        )}
      </main>
    </div>
  );
}