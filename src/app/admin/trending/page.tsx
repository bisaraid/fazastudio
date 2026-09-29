"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, RefreshCw, Loader2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrendTopic {
  id: string;
  keyword: string;
  niche_slug: string;
}

interface NicheCount {
  niche: string;
  count: number;
}

interface TrendsData {
  total: number;
  lastFetched: string | null;
  byNiche: NicheCount[];
  latest: TrendTopic[];
}

function fmtNum(n: number): string {
  return (n ?? 0).toLocaleString("id-ID");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec} detik lalu`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
}

function harvestOk(lastFetched: string | null): boolean {
  if (!lastFetched) return false;
  return Date.now() - new Date(lastFetched).getTime() < 7 * 60 * 60 * 1000;
}

export default function TrendingPage() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trends");
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(json.data as TrendsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan jaringan");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const triggerHarvest = async () => {
    setTriggering(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/trends/trigger", { method: "POST" });
      const json = await res.json();
      setResult({
        ok: res.ok,
        message: res.ok
          ? json.message || "Harvest selesai."
          : json.error || `HTTP ${res.status}`,
      });
      if (res.ok) void load();
    } catch (e) {
      setResult({
        ok: false,
        message: e instanceof Error ? e.message : "Terjadi kesalahan jaringan",
      });
    } finally {
      setTriggering(false);
    }
  };

  const ok = harvestOk(data?.lastFetched ?? null);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Trending</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Dashboard ide konten dari harvest.
      </p>

      {result && (
        <p
          className={
            "mt-4 rounded-lg border px-4 py-2 text-sm " +
            (result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/10 text-destructive")
          }
        >
          {result.message}
        </p>
      )}

      {loading && <p className="mt-6 text-sm text-muted-foreground">Memuat data tren...</p>}
      {error && <p className="mt-6 text-sm text-destructive">{error}</p>}

      {data && !error && (
        <>
          {/* HEADER — 3 stat card */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="relative rounded-xl border bg-card p-5">
              <TrendingUp className="absolute right-4 top-4 h-5 w-5 text-primary/50" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Total Topik Aktif
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{fmtNum(data.total)}</p>
            </div>
            <div className="relative rounded-xl border bg-card p-5">
              <Activity className="absolute right-4 top-4 h-5 w-5 text-primary/50" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Harvest Terakhir
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {timeAgo(data.lastFetched)}
              </p>
            </div>
            <div className="relative rounded-xl border bg-card p-5">
              <Loader2 className="absolute right-4 top-4 h-5 w-5 text-primary/50" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
              <p
                className={`mt-2 text-lg font-bold ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
              >
                {ok ? "✅ Berjalan normal" : "⚠️ Terlambat"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold tracking-tight">Topik per Niche</h2>
              {data.byNiche.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">Belum ada data per niche.</p>
              )}
              <ul className="mt-4 space-y-2.5 text-sm">
                {data.byNiche.map((item) => {
                  const pct = data.total > 0
                    ? Math.round((item.count / data.total) * 100)
                    : 0;
                  return (
                    <li key={item.niche}>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{item.niche}</span>
                        <span className="font-semibold tabular-nums">{item.count}</span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-primary/25"
                          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold tracking-tight">10 Topik Terbaru</h2>
              {data.latest.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">Belum ada topik.</p>
              )}
              <ul className="mt-4 space-y-2 text-sm">
                {data.latest.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 shrink-0 text-primary/50" />
                    <span className="min-w-0 flex-1 truncate">{t.keyword}</span>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {t.niche_slug}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bawah — Trigger trigger subtle */}
          <div className="mt-6 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Harvest otomatis berjalan setiap 6 jam.
              </p>
              <Button variant="outline" size="sm" onClick={triggerHarvest} disabled={triggering}>
                {triggering ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                Trigger Harvest Manual
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}