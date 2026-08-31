/**
 * Supabase browser client untuk AUTH (login/daftar) — @supabase/ssr.
 *
 * Menyimpan sesi di cookie (bukan localStorage) sehingga konsisten dengan
 * `middleware.ts` dan `createSupabaseServerClient()`. Dipakai di komponen
 * Client untuk `signInWithOAuth` / `signInWithOtp` / `signOut`.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}