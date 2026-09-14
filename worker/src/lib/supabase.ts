/**
 * Supabase service-role client — worker
 * Bypass RLS, hanya untuk operasi server-side di worker.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("[supabase] NEXT_PUBLIC_SUPABASE_URL wajib di-set");
  if (!key) throw new Error("[supabase] SUPABASE_SERVICE_ROLE_KEY wajib di-set");
  if (!_client) {
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
