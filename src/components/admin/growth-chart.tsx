"use client";

/**
 * Chart pertumbuhan (project & user) — SVG buatan sendiri, tanpa library baru.
 *
 * - Dimuat LAZY: `next/dynamic` di halaman overview, jadi tidak masuk bundle awal.
 * - Interaksi: hover (mouse/touch) + keyboard (←/→/Home/End) memilih titik →
 *   tooltip HTML melayang di atas SVG.
 * - Aksesibilitas: ada tabel data alternatif (toggle) dengan caption & th scope.
 * - Data perkiraan (is_estimated dari backfill) digambar PUTUS-PUTUS + titik bolong,
 *   plus catatan di legend.
 * - Empty state kalau titik < 2 (belum cukup data untuk menggambar garis).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Info, Table2 } from "lucide-react";
import { adminCachedFetch } from "@/lib/admin-cache";
import {
  buildMetricsPoints,
  formatDayLabel,
  labelIndices,
  linePath,
  nearestIndex,
  niceMax,
  splitEstimatedSegments,
  ticksFor,
  type MetricsRow,
} from "@/lib/admin-chart";
import { cn } from "@/lib/utils";

interface MetricsResponse {
  success?: boolean;
  error?: string;
  data?: { rows: MetricsRow[]; tableReady: boolean };
}

const PAD = { top: 12, right: 16, bottom: 28, left: 46 };
const HEIGHT = 220;
const COLOR_USERS = "hsl(var(--primary))";
/**
 * Seri kedua (project) — token, bukan hex mati. Nilainya beda per tema
 * (terang: emerald pekat kontras ≥3:1 di atas latar terang; gelap: emerald
 * lebih cerah) supaya garis tetap terbaca di kedua tema.
 */
const COLOR_PROJECTS = "hsl(var(--chart-projects))";

export default function GrowthChart({ days = 30 }: { days?: number }) {
  const [rows, setRows] = useState<MetricsRow[] | null>(null);
  const [tableReady, setTableReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [width, setWidth] = useState(640);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Lebar mengikuti container (responsif) tanpa library chart.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, el.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await adminCachedFetch<MetricsResponse>(
        `admin:metrics:${days}`,
        `/api/admin/metrics?days=${days}`
      );
      if (!json?.success) {
        setError(json?.error || "Gagal memuat riwayat metrik");
        setRows(null);
        return;
      }
      setRows(json.data?.rows ?? []);
      setTableReady(json.data?.tableReady ?? true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan jaringan");
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const points = useMemo(() => buildMetricsPoints(rows), [rows]);

  const geo = useMemo(() => {
    const innerW = Math.max(10, width - PAD.left - PAD.right);
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const maxRaw = points.reduce((m, p) => Math.max(m, p.totalUsers, p.totalProjects), 0);
    const max = niceMax(maxRaw);
    const step = points.length > 1 ? innerW / (points.length - 1) : 0;
    const xs = points.map((_, i) => PAD.left + (points.length === 1 ? innerW / 2 : i * step));
    const y = (v: number) => PAD.top + innerH - (Math.max(0, v) / max) * innerH;
    return { innerW, innerH, max, xs, y };
  }, [points, width]);

  const yTicks = useMemo(() => ticksFor(geo.max, 4), [geo.max]);
  const xLabels = useMemo(() => labelIndices(points.length, 4), [points.length]);

  const series = useMemo(
    () => [
      {
        key: "users",
        label: "Total user",
        color: COLOR_USERS,
        value: (r: MetricsRow) => r.totalUsers,
      },
      {
        key: "projects",
        label: "Total project",
        color: COLOR_PROJECTS,
        value: (r: MetricsRow) => r.totalProjects,
      },
    ],
    []
  );

  /** Pecah tiap seri jadi segmen solid + putus-putus (perkiraan). */
  const segmented = useMemo(() => {
    const flags = points.map((p, i) => ({ isEstimated: p.isEstimated, i }));
    return splitEstimatedSegments(flags);
  }, [points]);

  function xyOf(indices: { i: number }[], value: (r: MetricsRow) => number) {
    return indices.map((g) => ({ x: geo.xs[g.i], y: geo.y(value(points[g.i])) }));
  }

  function pickByClientX(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return;
    const idx = nearestIndex(geo.xs, clientX - rect.left);
    if (idx >= 0) setHover(idx);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    const cur = hover ?? 0;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setHover(Math.min(points.length - 1, cur + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHover(Math.max(0, cur - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHover(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHover(points.length - 1);
    } else if (e.key === "Escape") {
      setHover(null);
    }
  }

  const hasEstimated = points.some((p) => p.isEstimated);
  const hoverRow = hover !== null && hover >= 0 ? points[hover] : null;

  return (
    <section className="mt-6 rounded-xl border bg-card p-5" aria-labelledby="growth-chart-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="growth-chart-title" className="text-sm font-semibold tracking-tight">
          Pertumbuhan {days} Hari
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              {s.label}
            </span>
          ))}
          {hasEstimated && (
            <span className="flex items-center gap-1.5">
              <svg width="18" height="4" aria-hidden="true">
                <line
                  x1="0"
                  y1="2"
                  x2="18"
                  y2="2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
              </svg>
              perkiraan (backfill)
            </span>
          )}
        </div>
        {points.length >= 2 && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
            aria-controls="growth-chart-table"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
            {showTable ? "Sembunyikan tabel" : "Tabel data"}
          </button>
        )}
      </div>

      {loading && <div className="mt-4 h-[220px] animate-pulse rounded-xl bg-muted/40" />}

      {!loading && error && (
        <p className="mt-4 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {!loading && !error && points.length < 2 && (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
          <p className="text-sm font-medium">Belum cukup data untuk menggambar grafik</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {tableReady
              ? "Butuh minimal 2 hari snapshot. Jalankan cron harian, atau isi riwayat sekali dengan skrip backfill (scripts/backfill-admin-metrics.ts)."
              : "Tabel admin_metrics_daily belum ada. Jalankan migration 026 dulu, lalu backfill (scripts/backfill-admin-metrics.ts)."}
          </p>
        </div>
      )}

      {!loading && !error && points.length >= 2 && (
        <>
          <div
            ref={wrapRef}
            tabIndex={0}
            role="img"
            aria-label={`Grafik garis pertumbuhan ${points.length} hari terakhir: total user dan total project. Tekan tombol panah kiri/kanan untuk menelusuri titik, atau tombol "Tabel data" untuk versi teks.`}
            onKeyDown={onKeyDown}
            onMouseMove={(e) => pickByClientX(e.clientX)}
            onMouseLeave={() => setHover(null)}
            onTouchStart={(e) => pickByClientX(e.touches[0].clientX)}
            onTouchMove={(e) => pickByClientX(e.touches[0].clientX)}
            className="relative mt-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg
              width={width}
              height={HEIGHT}
              viewBox={`0 0 ${width} ${HEIGHT}`}
              className="block h-auto w-full"
              aria-hidden="true"
            >
              {yTicks.map((t) => (
                <g key={`y-${t}`}>
                  <line
                    x1={PAD.left}
                    y1={geo.y(t)}
                    x2={width - PAD.right}
                    y2={geo.y(t)}
                    stroke="hsl(var(--border))"
                    strokeWidth="1"
                  />
                  <text
                    x={PAD.left - 8}
                    y={geo.y(t)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    style={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  >
                    {t}
                  </text>
                </g>
              ))}

              {xLabels.map((i) => (
                <text
                  key={`x-${i}`}
                  x={geo.xs[i]}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  style={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                >
                  {formatDayLabel(points[i].date)}
                </text>
              ))}

              {series.map((s) => (
                <g key={s.key}>
                  {segmented.solid.map((seg, i) => (
                    <path
                      key={`solid-${i}`}
                      d={linePath(xyOf(seg, s.value))}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {segmented.estimated.map((seg, i) => (
                    <path
                      key={`est-${i}`}
                      d={linePath(xyOf(seg, s.value))}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                    />
                  ))}
                  {points.map((p, i) => (
                    <circle
                      key={`dot-${i}`}
                      cx={geo.xs[i]}
                      cy={geo.y(s.value(p))}
                      r={p.isEstimated ? 2.5 : 3}
                      fill={p.isEstimated ? "hsl(var(--card))" : s.color}
                      stroke={s.color}
                      strokeWidth={p.isEstimated ? 1.5 : 0}
                    />
                  ))}
                </g>
              ))}

              {hover !== null && points[hover] && (
                <line
                  x1={geo.xs[hover]}
                  y1={PAD.top}
                  x2={geo.xs[hover]}
                  y2={HEIGHT - PAD.bottom}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
              )}
            </svg>

            {hoverRow && hover !== null && (
              <div
                className={cn(
                  "pointer-events-none absolute top-2 z-10 w-max max-w-[220px] rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur",
                  geo.xs[hover] > width / 2 ? "right-2" : "left-2"
                )}
              >
                <p className="font-semibold">{formatDayLabel(hoverRow.date)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: COLOR_USERS }}
                    aria-hidden="true"
                  />
                  User: <span className="font-medium text-foreground">{hoverRow.totalUsers}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: COLOR_PROJECTS }}
                    aria-hidden="true"
                  />
                  Project:{" "}
                  <span className="font-medium text-foreground">{hoverRow.totalProjects}</span>
                </p>
                {hoverRow.isEstimated && (
                  <p className="mt-1 flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Info className="h-3 w-3" aria-hidden="true" />
                    data perkiraan
                  </p>
                )}
              </div>
            )}
          </div>

          {showTable && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table id="growth-chart-table" className="w-full min-w-[420px] text-left text-sm">
                <caption className="px-4 py-3 text-left text-xs text-muted-foreground">
                  Data pertumbuhan {days} hari terakhir (versi teks dari grafik di atas).
                </caption>
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Tanggal
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Total user
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Total project
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Catatan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.date} className="border-b border-border last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-2">{formatDayLabel(p.date)}</td>
                      <td className="px-4 py-2 tabular-nums">{p.totalUsers}</td>
                      <td className="px-4 py-2 tabular-nums">{p.totalProjects}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {p.isEstimated ? "perkiraan (backfill)" : "snapshot asli"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
