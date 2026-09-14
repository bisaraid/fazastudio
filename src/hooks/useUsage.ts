  
"use client";

import { useEffect, useState } from "react";

export interface UsageData {
  plan: string;
  creditsUsed: number;
  creditsTotal: number;
}

export interface UseUsageResult extends UsageData {
  loading: boolean;
  error: string | null;
}

export function useUsage(): UseUsageResult {
  const [data, setData] = useState<UsageData>({
    plan: "free",
    creditsUsed: 0,
    creditsTotal: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch("/api/usage");
        if (!res.ok) {
          throw new Error("Gagal memuat usage (" + res.status + ")");
        }
        const json = await res.json();
        if (json?.success && json?.data) {
          setData({
            plan: json.data.plan || "free",
            creditsUsed: Number(json.data.creditsUsed) || 0,
            creditsTotal: Number(json.data.creditsTotal) || 0,
          });
          setError(null);
        } else {
          throw new Error(json?.error || "Response usage tidak valid");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat usage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void refresh();

    const onRefresh = () => {
      void refresh();
    };
    window.addEventListener("usage:refresh", onRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener("usage:refresh", onRefresh);
    };
  }, []);

  return { ...data, loading, error };
}  
