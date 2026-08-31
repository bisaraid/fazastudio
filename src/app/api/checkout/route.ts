import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { getServerIdentity, deviceCookieOptions, DEVICE_ID_COOKIE } from "@/lib/identity";
import Midtrans from "midtrans-client";

/**
 * GET /api/checkout?plan=pro
 *
 * Membuat transaksi Midtrans Snap untuk plan berbayar (pro/team).
 * Mengembalikan { token, redirect_url } — frontend membuka popup Snap
 * dengan `window.snap.pay(token)`.
 *
 * Harga (IDR):
 * - starter → 49.000
 * - pro    → 149.000
 *
 * order_id format: `${plan}_${timestamp}_${base64url(identityKey)}`
 * - Prefix plan dibaca di webhook (MIDTRANS_SERVER_KEY signature)
 * - identityKey di-encode base64url (reversible, aman untuk order_id Midtrans)
 *   sehingga webhook bisa memanggil setPlan(identityKey, plan) dengan benar.
 *
 * TODO (blocked on env — user must add keys):
 * - Set MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY di .env.local
 * - Set NEXT_PUBLIC_MIDTRANS_CLIENT_KEY (untuk Snap.js di browser)
 * - Set MIDTRANS_IS_PRODUCTION (false = sandbox)
 */

const PLAN_PRICES: Record<string, number> = {
  starter: 49000,
  pro: 149000,
};

const VALID_PLANS = Object.keys(PLAN_PRICES);

/** encode base64url (aman untuk order_id Midtrans) */
function b64urlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

export async function GET(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  const plan = request.nextUrl.searchParams.get("plan") || "";
  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json(
      { success: false, error: "Plan tidak valid. Pilihan: starter, pro" },
      { status: 400 }
    );
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    return NextResponse.json(
      { success: false, error: "Pembayaran belum di-konfigurasikan (MIDTRANS_SERVER_KEY missing). TODO: add to .env.local" },
      { status: 503 }
    );
  }

  const grossAmount = PLAN_PRICES[plan];
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";

  try {
    const identity = getServerIdentity(request);
    const identityKey = identity.identityKey;
    const orderId = `${plan}_${Date.now()}_${b64urlEncode(identityKey)}`;

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
      // customer_details: optional — skip karena belum ada data profil (MVP)
    };

    const response = await snap.createTransaction(parameter);

    const res = NextResponse.json({
      success: true,
      token: response.token,
      redirect_url: response.redirect_url || null,
    });
    if (identity.isNew) {
      res.cookies.set(DEVICE_ID_COOKIE, identity.deviceId, deviceCookieOptions());
    }
    return res;
  } catch (error) {
    console.error("[checkout] Midtrans error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Gagal membuat transaksi pembayaran" },
      { status: 502 }
    );
  }
}