/**
 * Supabase server client (cookie-aware) untuk App Router — @supabase/ssr.
 *
 * Dipakai di Server Components, Route Handlers, dan Server Actions yang
 * membutuhkan sesi user yang login (bukan anon). Bisa membaca & menulis cookie
 * sesi (`sb-<project-ref>-auth-token`) sehingga middleware + server share
 * session yang sama.
 *
 * Berbeda dari `client.ts`/`server.ts` lama (persistSession=false / anon),
 * client ini memakai anon key tapi sesinya active user (login Google/Email).
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Dipanggil dari Server Component — abaikan; sesi di-refresh oleh
            // middleware/@supabase/ssr secara otomatis.
          }
        },
      },
    }
  );
}