"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function ConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const interval = window.setInterval(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          window.clearInterval(interval);
          router.replace(next);
          return;
        }
        attempts += 1;
        if (attempts > 20) {
          window.clearInterval(interval);
          setError("Sesi belum terkonfirmasi. Coba buka link email lagi.");
        }
      } catch {
        attempts += 1;
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [router, next]);
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm">Menyiapkan sesi...</p>
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmInner />
    </Suspense>
  );
}
