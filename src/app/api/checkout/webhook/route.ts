import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { setPlan, PlanTier } from "@/lib/usage";

/**
 * POST /api/checkout/webhook
 *
 * Webhook Midtrans Snap. Pada `transaction_status` = "settlement" atau "capture":
 * - extract plan + identityKey dari order_id (`${plan}_${ts}_${base64url(identity)}`)
 * - panggil setPlan(identityKey, plan) → aktifkan kredit
 *
 * Verifikasi signature:
 *   SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
 * (digabung tanpa separator, lalu hex-digest) dibandingkan dgn `signature_key`
 * pada body webhook Midtrans.
 *
 * TODO (blocked on env — user must add keys):
 * - Set MIDTRANS_SERVER_KEY di .env.local
 * - Daftarkan URL ini sebagai Payment Notification URL di
 *   https://dashboard.midtrans.com > Settings > Configuration
 */
export async function POST(request: NextRequest) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    return NextResponse.json(
      { success: false, error: "Webhook belum di-konfigurasikan (MIDTRANS_SERVER_KEY missing). TODO: add to .env.local" },
      { status: 503 }
    );
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body webhook bukan JSON valid" }, { status: 400 });
  }

  const orderId = body?.order_id;
  const statusCode = body?.status_code;
  const grossAmount = body?.gross_amount;
  const receivedSignature = body?.signature_key;

  if (typeof orderId !== "string" || statusCode === undefined || grossAmount === undefined || typeof receivedSignature !== "string") {
    return NextResponse.json({ success: false, error: "Field webhook tidak lengkap" }, { status: 400 });
  }

  // ===== Verifikasi signature =====
  const plain = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  const expectedSignature = createHash("sha512").update(plain).digest("hex");

  if (expectedSignature !== receivedSignature) {
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 400 });
  }

  const transactionStatus = body?.transaction_status; // settlement | capture | pending | ...

  // Hanya proses pembayaran yang berhasil (lunas)
  if (transactionStatus === "settlement" || transactionStatus === "capture") {
    // order_id: `${plan}_${ts}_${base64url(identityKey)}`
    const [planPart, , identityPart] = orderId.split("_");
    let identityKey: string | null = null;
    try {
      identityKey = Buffer.from(identityPart, "base64url").toString("utf8");
    } catch {
      identityKey = null;
    }

    const plan = planPart as PlanTier;
    if (identityKey && (plan === "starter" || plan === "pro")) {
      const ok = await setPlan(identityKey, plan);
      if (!ok) {
        console.error(`[webhook] setPlan gagal for identity:${identityKey} plan:${plan}`);
      }
    }
  }

  // Selalu balas 200 agar Midtrans tidak retry untuk status non-settlement.
  return NextResponse.json({ success: true });
}