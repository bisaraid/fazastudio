import { NextRequest, NextResponse } from "next/server";
import { setPlan, PlanTier } from "@/lib/usage";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  derivePlanAndIdentity,
  grossMatchesPlan,
  isCapturedTransaction,
  verifyMidtransSignature,
} from "@/lib/midtrans";

/**
 * POST /api/checkout/webhook
 *
 * Webhook Midtrans Snap. Su `transaction_status` = "settlement" o "capture":
 * - estrae plan + identityKey dall'order_id (`${plan}_${ts}_${base64url(identity)}`)
 * - applica il piano SOLO se (a) e' davvero pagato, (b) l'importo corrisponde al
 *   prezzo server, (c) l'ordine NON e' gia' stato processato (idempotency).
 *
 * IDEMPOTENCY: la funzione `claim_webhook` (migration 025) reclama l'ordine in
 * modo atomico. Un retry/duplicato Midtrans vede l'ordine gia' reclamato e NON
 * riapplica il piano -> NON resetta credits_used.
 *
 * Verifica firma:
 *   SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
 * (concatenati senza separatore, poi hex-digest) confrontato con `signature_key`.
 */
export async function POST(request: NextRequest) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    return NextResponse.json(
      { success: false, error: "Webhook belum di-konfigurasikan (MIDTRANS_SERVER_KEY missing)." },
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
  const transactionStatus = body?.transaction_status;

  if (
    typeof orderId !== "string" ||
    statusCode === undefined ||
    grossAmount === undefined ||
    typeof receivedSignature !== "string"
  ) {
    return NextResponse.json({ success: false, error: "Field webhook tidak lengkap" }, { status: 400 });
  }

  // 1) Verifica firma (copre order_id + status + importo + server key)
  if (!verifyMidtransSignature(orderId, String(statusCode), String(grossAmount), serverKey, receivedSignature)) {
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 400 });
  }

  // 2) Estrae piano + identity dall'order_id
  const derived = derivePlanAndIdentity(orderId);
  if (!derived) {
    return NextResponse.json({ success: false, error: "order_id tidak valid" }, { status: 400 });
  }

  // 3) Solo transazioni finalizzate (settlement/capture) attivano il piano
  if (!isCapturedTransaction(transactionStatus)) {
    // Sempre 200 per non far retry Midtrans sugli stati non-finalizzati.
    return NextResponse.json({ success: true });
  }

  // 4) Verifica che l'importo corrisponda al prezzo server del piano.
  if (!grossMatchesPlan(derived.plan, grossAmount)) {
    console.error(
      `[webhook] gross_amount (${grossAmount}) non corrisponde al piano ${derived.plan}`
    );
    return NextResponse.json({ success: false, error: "gross_amount mismatch" }, { status: 400 });
  }

  // 5) IDEMPOTENCY (exactly-once): reclama l'ordine in modo atomico.
  const service = createServiceRoleClient();
  const claimed = await service.rpc("claim_webhook", { p_order_id: orderId }).maybeSingle();

  if (claimed.error) {
    // Errore DB transiente -> 500 cosi' Midtrans retry e non si perde il grant.
    console.error("[webhook] claim_webhook error:", claimed.error.message);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }

  if (claimed.data !== true) {
    // Ordine gia' processato in precedenza -> risposta ok idempotente, nessuna azione
    // (evita il reset di credits_used su replay).
    return NextResponse.json({ success: true });
  }

  // 6) Prima (unica) volta per questo ordine -> applica il piano.
  const ok = await setPlan(derived.identityKey, derived.plan as PlanTier);
  if (!ok) {
    console.error(`[webhook] setPlan gagal for identity (plan=${derived.plan})`);
  }

  return NextResponse.json({ success: true });
}