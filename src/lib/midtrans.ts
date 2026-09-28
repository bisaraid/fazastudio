import { createHash } from "crypto";

/**
 * Helpers puri (testable) per il webhook Midtrans — /api/checkout/webhook.
 * Tiene separata la logica di verifica (firma, importo, stato, idempotenza)
 * dal routing Next.js, cosi` da essere coperta da test vitest.
 *
 * Formato order_id: `${plan}_${timestamp}_${base64url(identityKey)}`.
 */

export const PLAN_PRICES: Record<string, number> = {
  starter: 49000,
  pro: 149000,
};

export const VALID_PLANS = Object.keys(PLAN_PRICES);

/** Stato transazione "pagato" -> l'ordine va attivato. */
export function isCapturedTransaction(transactionStatus: unknown): boolean {
  return transactionStatus === "settlement" || transactionStatus === "capture";
}

/** Valida che la stringa sia base64url legale (charset + padding). */
function isValidBase64Url(s: string): boolean {
  if (typeof s !== "string" || s.length === 0 || s.length % 4 === 1) return false;
  return /^[A-Za-z0-9_-]+={0,2}$/.test(s);
}

/**
 * Estrae plan + identityKey dall'order_id Midtrans.
 * Return null se plan non valido o identity non decodificabile/garbage.
 */
export function derivePlanAndIdentity(orderId: string): { plan: string; identityKey: string } | null {
  const parts = orderId.split("_");
  const plan = parts[0];
  const identityPart = parts.length >= 3 ? parts[2] : "";
  if (!VALID_PLANS.includes(plan)) return null;
  if (!isValidBase64Url(identityPart)) return null;

  let identityKey: string | null = null;
  try {
    identityKey = Buffer.from(identityPart, "base64url").toString("utf8");
  } catch {
    identityKey = null;
  }
  if (!identityKey || identityKey.length === 0) return null;

  return { plan, identityKey };
}

/** Verifica che l'importo ricevuto corrisponda al prezzo server del piano. */
export function grossMatchesPlan(plan: string, grossAmount: unknown): boolean {
  if (grossAmount === undefined || grossAmount === null) return false;
  return PLAN_PRICES[plan] === Number(grossAmount);
}

/** Calcola la firma Midtrans (hex digest). */
export function computeMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string
): string {
  return createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest("hex");
}

/** Verifica la firma ricevuta in tempo costante (sui byte ascii del hex). */
export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  receivedSignature: string
): boolean {
  if (typeof receivedSignature !== "string" || receivedSignature.length === 0) return false;
  const expected = computeMidtransSignature(orderId, statusCode, grossAmount, serverKey);
  if (expected.length !== receivedSignature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ receivedSignature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Decide se applicare il piano a una transazione.
 * - `alreadyClaimed` = ordine gia` processato (idempotency) -> no re-grant/reset.
 * - `planValid`      = piano riconosciuto.
 * - `grossOk`        = importo corrisponde al prezzo server.
 * - `captured`       = transazione settlement/capture.
 */
export function shouldGrant(input: {
  alreadyClaimed: boolean;
  planValid: boolean;
  grossOk: boolean;
  captured: boolean;
}): boolean {
  return input.captured && input.planValid && input.grossOk && !input.alreadyClaimed;
}