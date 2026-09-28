import { describe, it, expect } from "vitest";
import {
  PLAN_PRICES,
  derivePlanAndIdentity,
  grossMatchesPlan,
  isCapturedTransaction,
  verifyMidtransSignature,
  computeMidtransSignature,
  shouldGrant,
} from "@/lib/midtrans";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("midtrans webhook helpers", () => {
  it("derivePlanAndIdentity: decodifica plan+identity dall'order_id", () => {
    const d = derivePlanAndIdentity(`pro_1710000000_${b64("anon:device-1")}`);
    expect(d?.plan).toBe("pro");
    expect(d?.identityKey).toBe("anon:device-1");
    expect(PLAN_PRICES.pro).toBe(149000);
  });

  it("derivePlanAndIdentity: null per piano non valido", () => {
    expect(derivePlanAndIdentity(`vip_1710000000_${b64("anon:x")}`)).toBeNull();
  });

  it("derivePlanAndIdentity: null per identity base64 non valida", () => {
    expect(derivePlanAndIdentity("pro_1710000000_!!bad!!")).toBeNull();
  });

  it("isCapturedTransaction: solo settlement/capture attivano l'ordine", () => {
    expect(isCapturedTransaction("settlement")).toBe(true);
    expect(isCapturedTransaction("capture")).toBe(true);
    expect(isCapturedTransaction("pending")).toBe(false);
    expect(isCapturedTransaction("failure")).toBe(false);
  });

  it("grossMatchesPlan: accetta importo giusto, rifiuta il mismatch", () => {
    expect(grossMatchesPlan("pro", 149000)).toBe(true);
    expect(grossMatchesPlan("pro", 149001)).toBe(false);
    expect(grossMatchesPlan("starter", 49000)).toBe(true);
    expect(grossMatchesPlan("starter", 49999)).toBe(false);
    expect(grossMatchesPlan("pro", undefined)).toBe(false);
  });

  it("verifyMidtransSignature: accetta firma valida, rifiuta importo/manomissione", () => {
    const key = "server-key";
    const sign = (o: string, s: string, g: string) => computeMidtransSignature(o, s, g, key);
    expect(verifyMidtransSignature("o", "201", "1000", key, sign("o", "201", "1000"))).toBe(true);
    // importo modificato -> firma calcolata su importo diverso -> rifiutata
    expect(verifyMidtransSignature("o", "201", "1000", key, sign("o", "201", "999"))).toBe(false);
  });

  it("shouldGrant: NON concede su replay (gia' reclamato) -> niente reset crediti", () => {
    expect(
      shouldGrant({ alreadyClaimed: true, planValid: true, grossOk: true, captured: true })
    ).toBe(false);
  });

  it("shouldGrant: NON concede su importo errato (mismatch amount)", () => {
    expect(
      shouldGrant({ alreadyClaimed: false, planValid: true, grossOk: false, captured: true })
    ).toBe(false);
  });

  it("shouldGrant: concede solo al primo processing valido", () => {
    expect(
      shouldGrant({ alreadyClaimed: false, planValid: true, grossOk: true, captured: true })
    ).toBe(true);
  });
});