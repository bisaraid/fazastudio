// ============================================================
// Fase 4A — Kebijakan refund kredit script (tipis, mudah diuji).
//
// Dipisah dari route supaya aturan berikut bisa diuji dengan mock:
//   1. Refund HANYA bila debet berstatus "charged" pada request yang sama.
//      - "failopen"  → tidak ada kredit yang dipotong ⇒ JANGAN refund.
//      - "exhausted" → request ditolak 402 ⇒ tidak ada yang dipotong.
//   2. Kunci idempotensi = `script:<projectId>:<requestId>` (requestId =
//      globalThis.crypto.randomUUID() yang dibuat SEKALI di awal request).
//      Kunci per-project saja TIDAK cukup: dua percobaan berbeda untuk project
//      yang sama tidak boleh saling memblokir, dan satu percobaan tidak boleh
//      di-refund dua kali.
//   3. Period refund = period DEBET (dibawa oleh DebitResult), bukan
//      `currentPeriod()` saat refund dipanggil (bisa beda bulan).
//   4. Fungsi ini TIDAK PERNAH throw: kegagalan refund hanya dilog.
// ============================================================

import {
  refundCredit,
  refundCreditForUser,
  type DebitResult,
  type RefundResult,
} from "@/lib/usage";

/** Kunci idempotensi refund untuk satu percobaan generate-script. */
export function scriptRefundKey(projectId: string | null | undefined, requestId: string): string {
  return `script:${projectId || "noproject"}:${requestId}`;
}

export interface ScriptRefundParams {
  /** Hasil debet pada request ini (null = tidak ada debet sama sekali). */
  charge: DebitResult | null;
  projectId?: string | null;
  identityKey?: string | null;
  userId?: string | null;
  /** UUID yang dibuat sekali di awal request; dipakai juga oleh debet. */
  requestId: string;
  reason?: string;
}

/**
 * Refund 1 kredit script bila (dan hanya bila) debet berhasil.
 * Mengembalikan null bila memang tidak ada yang perlu di-refund.
 */
export async function refundScriptDebit(
  params: ScriptRefundParams
): Promise<RefundResult | null> {
  const { charge, projectId, identityKey, userId, requestId, reason } = params;

  if (!charge || charge.status !== "charged") {
    // failopen → tidak ada potongan; exhausted → ditolak sebelum (harusnya)
    // tidak sampai ke sini. Dua-duanya TIDAK boleh di-refund.
    return null;
  }

  const idempotencyKey = scriptRefundKey(projectId, requestId);
  const opts = { period: charge.period, idempotencyKey, reason };

  try {
    const result = userId
      ? await refundCreditForUser(userId, opts)
      : await refundCredit(identityKey ?? "", opts);

    if (result.status === "already") {
      console.warn(`[credit-refund] sudah pernah di-refund (idempoten): ${idempotencyKey}`);
    } else if (result.status !== "refunded") {
      console.warn(`[credit-refund] refund ${result.status}: ${idempotencyKey}`);
    }
    return result;
  } catch (e) {
    // Sabuk pengaman terakhir: refund tidak boleh menggagalkan respons error
    // yang sedang dikirim (route tetap membalas 500 aslinya).
    console.error("[credit-refund] refundScriptDebit gagal tak terduga:", e);
    return { status: "error", creditsUsed: null };
  }
}
