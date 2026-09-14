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

  // 2) Klaim user_usage — memindahkan PLAN + KREDIT TER-SISA ke akun secara
  //    atomic via RPC `claim_usage_to_user` (migration 018):
  //    - Belum ada baris akun per (user_id, period) → re-key (plan&kredit ikut).
  //    - Baris akun sudah ada → merge: used = sum (cap total), total = max,
  //      plan = prioritas tertua (pro > starter > free); baris anon dihapus.
  //    Idempoten & aman para multi-device.
  let usageOk = true;
  try {
    const { error: claimUsageErr } = await service.rpc("claim_usage_to_user", {
      p_user_id: userId,
      p_identity_key: prefixKey,
    });
    if (claimUsageErr) {
      console.warn("[claim] claim_usage_to_user error:", claimUsageErr.message);
      usageOk = false;
    }
  } catch (e) {
    console.warn("[claim] claim_usage_to_user throw:", e instanceof Error ? e.message : e);
    usageOk = false;
  }

  // Fallback (migration 018 belum deploy): re-key user_id saja — plan & baris
  // tetap ikut baris (semua kredit ter-sisa di kolom baris sendiri).
  if (!usageOk) {
    const { error: uErr } = await service
      .from("user_usage")
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .eq("identity_key", prefixKey)
      .is("user_id", null);

    if (uErr) {
      console.warn("[claim] usage fallback error:", uErr.message);
    }
    usageOk = !uErr;
  }

  return { claimedProjects: !pErr, claimedUsage: usageOk };
}

/**
 * Versi untuk server route yang memiliki akses request (untuk membaca cookie
 * device_id). Mengambil identity dari request lalu memanggil claim.
 */
export async function claimFromRequest(userId: string, request: Request) {
  const identity = getServerIdentity(request);
  return claimDeviceDataToUser(userId, identity.identityKey as string | null);
}