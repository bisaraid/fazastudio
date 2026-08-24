/**
 * Supabase server client — untuk Server Components, Route Handlers, Server Actions
 * Menggunakan anon key, tetap terikat RLS policy (public read only).
 */
import { createClient } from "@supabase/supabase-js";

export const createServerClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("❌ SUPABASE_URL dan SUPABASE_ANON_KEY wajib diisi di .env");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};
