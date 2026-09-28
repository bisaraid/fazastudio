import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { PLAN_PRICES, VALID_PLANS } from "@/lib/midtrans";
import Midtrans from "midtrans-client";

/**
 * GET /api/checkout?plan=pro
 *
 * Membuat transaksi Midtrans Snap per plan berbayar (starter/pro).
 * Return { token, redirect_url } — frontend apre il popup Snap con
 * `window.snap.pay(token)`.
 *
 * order_id format: `${plan}_${timestamp}_${base64url(userId)}`
 * - Il piano viene legato all'ACCOUNT (user_id), NON al device cookie.
 *   Il checkout RICHIEDE un utente autenticato: un utente anonimo riceve
 *   401 LOGIN_REQUIRED. In questo modo il piano (e i relativi crediti)
 *   restano legati all'account e non si perdono cambiando dispositivo.
 * - Il prefisso plan viene letto nel webhook (firma MIDTRANS_SERVER_KEY).
 *
 * TODO (blocked on env — user must add keys):
 * - Set MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY in .env.local
 * - Set NEXT_PUBLIC_MIDTRANS_CLIENT_KEY (per Snap.js nel browser)
 * - Set MIDTRANS_IS_PRODUCTION (false = sandbox)
 */

/** encode base64url (safe per order_id Midtrans) */
function b64urlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

export async function GET(request: NextRequest) {
  // 0) AUTH CHECK (same-origin / X-API-Key)
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  // 1) Piano valido
  const plan = request.nextUrl.searchParams.get("plan") || "";
  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json(
      { success: false, error: "Plan tidak valid. Pilihan: starter, pro" },
      { status: 400 }
    );
  }

  // 2) LOGIN OBBLIGATORIO — il piano va legato all'account, non al device.
  const session = createSupabaseServerClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user || typeof user.id !== "string" || user.id.length === 0) {
    return NextResponse.json(
      {
        success: false,
        code: "LOGIN_REQUIRED",
        error: "Daftar loggato prima di procedere con il pagamento, così il piano resta legato al tuo account.",
      },
      { status: 401 }
    );
  }

  // 3) Config Midtrans
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    return NextResponse.json(
      {
        success: false,
        error: "Pembayaran belum di-konfigurasikan (MIDTRANS_SERVER_KEY missing). TODO: add to .env.local",
      },
      { status: 503 }
    );
  }

  const grossAmount = PLAN_PRICES[plan];
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";

  try {
    // 4) order_id legato all'account (user_id), non al device cookie.
    const orderId = `${plan}_${Date.now()}_${b64urlEncode(user.id)}`;

    const snap = new Midtrans.Snap({
      isProduction,
      serverKey,
      clientKey: process.env.MIDTRANS_CLIENT_KEY || "",
    });

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      item_details: [
        {
          id: plan,
          price: grossAmount,
          quantity: 1,
          name: "Plan " + plan,
        },
      ],
      // customer_details: optional — si può aggiungere email/nome dal profilo
    };

    const response = await snap.createTransaction(parameter);

    return NextResponse.json({
      success: true,
      token: response.token,
      redirect_url: response.redirect_url || null,
    });
  } catch (error) {
    console.error("[checkout] Midtrans error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Gagal membuat transaksi pembayaran" },
      { status: 502 }
    );
  }
}