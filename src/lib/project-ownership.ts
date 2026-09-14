import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * Ownership guard voor project writes — Faza Studio (ACS).
 *
 * Alle write-operaties op bestaande projecten (update/delete) moeten
 * eerst controleren of de caller daadwerkelijk de eigenaar is, om IDOR
 * (Insecure Direct Object Reference) te voorkomen. De check gebeurt
 * server-side via service-role client.
 *
 * Logica:
 * - Als de caller is ingelogd (userId beschikbaar) → project moet
 *   `.eq("user_id", userId)` matchen. Daarnaast staat een valback naar
 *   `identity_key` toe (zodat "legacy" projecten die alleen een device-key
 *   hebben maar later zijn geclaimed, ook door de juiste login-eigenaar
 *   kunnen worden aangepast).
 * - Als de caller anoniem is (geen userId) → project moet matchen op
 *   `identity_key`.
 *
 * Return true als de project-row (id) bestaat én eigendom matcht.
 * Dit is één SELECT-query, dus de ownership-bepaling is gebaseerd op de
 * actuele DB-row (geen race met updates tussendoor).
 */
export interface RequireProjectOwnershipInput {
  projectId: string;
  identityKey?: string | null;
  userId?: string | null;
}

export async function requireProjectOwnership(
  input: RequireProjectOwnershipInput
): Promise<boolean> {
  const { projectId, identityKey, userId } = input;

  if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
    return false;
  }

  const supabase = createServiceRoleClient();

  let query = supabase.from("projects").select("id").eq("id", projectId);

  if (userId && typeof userId === "string" && userId.trim() !== "") {
    // Eigenaar via akun; valback naar identity_key (legacy/devices).
    const filters = [`user_id.eq.${userId}`];
    if (identityKey && typeof identityKey === "string" && identityKey.trim() !== "") {
      filters.push(`identity_key.eq.${identityKey}`);
    }
    query = query.or(filters.join(","));
  } else if (identityKey && typeof identityKey === "string" && identityKey.trim() !== "") {
    query = query.eq("identity_key", identityKey);
  } else {
    // Geen enkele identificatie beschikbaar → geen toegang.
    return false;
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.warn("[project-ownership] ownership check error:", error.message);
    return false;
  }

  return data !== null;
}