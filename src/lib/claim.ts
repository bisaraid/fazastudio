import { createServiceRoleClient } from "@/lib/supabase/service";
import { getServerIdentity } from "@/lib/identity";

/**
 * Klaim data anon -> akun.
 *
 * Ketika user login (baru daftar maupun existing), proyek & usage yang dibuat
 * saat mode anonim (identity_key = 'anon:<device_id>') dipindahkan kepemilikan
 * ke user_id akun. Ini inti alur konversi: "Daftar untuk simpan hasil ini".
 *
 * Idempoten: hanya mengupdate baris yang user_id-nya masih null, jadi aman
 * dipanggil berulang.
 */
export async function claimDeviceDataToUser(userId: string, identityKey?: string | null) {
  const prefixKey = identityKey || null;

  if (!prefixKey) return;

  const service = createServiceRoleClient();

  // 1) Klaim projects
  const { error: pErr } = await service
    .from("projects")
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq("identity_key", prefixKey)
    .is("user_id", null);

  if (pErr) {
    console.warn("[claim] projects error:", pErr.message);
  }

  // 2) Klaim user_usage (batasi ke bulan berjalan)
  const { error: uErr } = await service
    .from("user_usage")
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq("identity_key", prefixKey)
    .is("user_id", null);

  if (uErr) {
    console.warn("[claim] usage error:", uErr.message);
  }

  return { claimedProjects: !pErr, claimedUsage: !uErr };
}

/**
 * Versi untuk server route yang memiliki akses request (untuk membaca cookie
 * device_id). Mengambil identity dari request lalu memanggil claim.
 */
export async function claimFromRequest(userId: string, request: Request) {
  const identity = getServerIdentity(request);
  return claimDeviceDataToUser(userId, identity.identityKey as string | null);
}