"use client";

import { useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface UseUserResult {
  user: User | null;
  /** Sudah selesai memuat session pertama kali (untuk hindari flash salah). */
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook client untuk membaca session user (login/logout) secara reaktif.
 *
 * Dipakai di navbar/landing agar status login tampil benar (Dashboard/avatar
 * vs Masuk/Daftar). Berlangganan `onAuthStateChange` sehingga langsung
 * update tanpa reload.
 */
export function useUser(): UseUserResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (active) setUser(session?.user ?? null);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading, refresh };
}