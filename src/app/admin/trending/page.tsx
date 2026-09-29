"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrendingTopic {
  id: string;
  keyword: string;
  niche_slug: string;
  score: number;
  fetched_at: string;
}

interface TrendsData {
  total: number;
  lastFetched: string | null;
  latest: TrendingTopic[];
}

function fmtNum(n: number): string {
  return (n ?? 0).toLocaleString("id-ID");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID");
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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trending</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor hasil harvest ide konten.
          </p>
        </div>
        <Button onClick={triggerHarvest} disabled={triggering}>
          {triggering ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-4 w-4" />
          )}
          Trigger Harvest Manual
        </Button>
      </div>

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
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Total Trend Ideas
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {fmtNum(data.total)}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Terakhir di-harvest
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {fmtDate(data.lastFetched)}
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Keyword</th>
                    <th className="px-4 py-3 font-medium">Niche</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Fetched At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latest.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        Belum ada data tren.
                      </td>
                    </tr>
                  )}
                  {data.latest.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-border transition-colors duration-200 last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 text-sm">
                        <span className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 shrink-0 text-primary/50" />
                          {t.keyword}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {t.niche_slug}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums">{t.score}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {fmtDate(t.fetched_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}