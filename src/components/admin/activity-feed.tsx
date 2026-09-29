"use client";

/**
 * Activity feed admin — maksimal 10 item terbaru.
 * Sumber: /api/admin/activity (audit log admin + project terbaru).
 *
 * Waktu ditampilkan relatif ("14 menit lalu") dengan elemen <time dateTime=...>
 * supaya tetap informatif untuk screen reader / hover.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Folder, ShieldCheck } from "lucide-react";
import { adminCachedFetch } from "@/lib/admin-cache";
import type { ActivityItem } from "@/lib/admin-activity";
import { timeAgo } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

interface ActivityResponse {
  success?: boolean;
  error?: string;
  data?: { items: ActivityItem[]; auditReady: boolean };
}

export default function ActivityFeed({ limit = 10 }: { limit?: number }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [auditReady, setAuditReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await adminCachedFetch<ActivityResponse>(
        `admin:activity:${limit}`,
        `/api/admin/activity?limit=${limit}`
      );
      if (!json?.success) {
        setError(json?.error || "Gagal memuat aktivitas");
        setItems(null);
        return;
      }
      setItems(json.data?.items ?? []);
      setAuditReady(json.data?.auditReady ?? true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan jaringan");
      setItems(null);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mt-6 overflow-hidden rounded-xl border bg-card" aria-labelledby="activity-feed-title">
      <div className="flex items-center gap-2 px-4 py-3">
        <h2 id="activity-feed-title" className="text-sm font-semibold tracking-tight">
          Aktivitas Terbaru
        </h2>
        <span className="text-xs text-muted-foreground">maks {limit} item</span>
      </div>

      {loading && (
        <div className="space-y-2 px-4 pb-4">
          <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
        </div>
      )}

      {!loading && error && (
        <p className="flex items-center gap-2 px-4 pb-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {!loading && !error && items && items.length === 0 && (
        <p className="px-4 pb-4 text-sm text-muted-foreground">
          Belum ada aktivitas yang tercatat.
        </p>
      )}

      {!loading && !error && items && items.length > 0 && (
        <>
          <ul className="divide-y divide-border border-t border-border">
            {items.map((it) => {
              const isAudit = it.kind === "audit";
              const Icon = isAudit ? ShieldCheck : Folder;
              return (
                <li key={it.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      isAudit ? "bg-primary/10 text-primary" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{it.title}</span>
                    {it.detail && (
                      <span className="block truncate text-xs text-muted-foreground">{it.detail}</span>
                    )}
                  </span>
                  <time
                    dateTime={it.at}
                    title={new Date(it.at).toLocaleString("id-ID")}
                    className="shrink-0 whitespace-nowrap text-xs text-muted-foreground"
                  >
                    {timeAgo(it.at)}
                  </time>
                </li>
              );
            })}
          </ul>
          {!auditReady && (
            <p className="border-t border-border px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
              Log audit belum tersedia — jalankan migration 027 untuk mencatat aksi admin.
            </p>
          )}
        </>
      )}
    </section>
  );
}
