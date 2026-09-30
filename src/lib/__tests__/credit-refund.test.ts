import { test, expect, describe, vi, beforeEach } from "vitest";
import type { RefundResult } from "@/lib/usage";

// ============================================================
// Fase 4A — kebijakan refund diuji dengan MOCK (tanpa DB).
// `@/lib/usage` diganti seluruhnya; hanya dua fungsi refund yang dipakai.
// ============================================================

const mocks = vi.hoisted(() => ({
  refundCredit: vi.fn(),
  refundCreditForUser: vi.fn(),
}));

vi.mock("@/lib/usage", () => ({
  refundCredit: mocks.refundCredit,
  refundCreditForUser: mocks.refundCreditForUser,
}));

import { refundScriptDebit, scriptRefundKey } from "@/lib/credit-refund";

const REQUEST_ID = "3f9a1c2e-7b41-4a0d-9f62-8c5d1b0e4a77";
const CHARGED = { status: "charged", period: "2026-09" } as const;
const FAILOPEN = { status: "failopen", period: "2026-09" } as const;
const EXHAUSTED = { status: "exhausted", period: "2026-09" } as const;

function refunded(creditsUsed = 4): RefundResult {
  return { status: "refunded", creditsUsed };
}

beforeEach(() => {
  mocks.refundCredit.mockReset();
  mocks.refundCreditForUser.mockReset();
});

describe("scriptRefundKey", () => {
  test("kunci memuat projectId DAN requestId (bukan projectId saja)", () => {
    const key = scriptRefundKey("p-1", REQUEST_ID);
    expect(key).toBe(`script:p-1:${REQUEST_ID}`);
    // Dua percobaan berbeda untuk project yang sama → kunci berbeda.
    expect(scriptRefundKey("p-1", REQUEST_ID)).not.toBe(scriptRefundKey("p-1", "uuid-lain"));
  });

  test("projectId kosong/null → penanda 'noproject' (tidak undefined)", () => {
    expect(scriptRefundKey(null, REQUEST_ID)).toBe(`script:noproject:${REQUEST_ID}`);
    expect(scriptRefundKey("", REQUEST_ID)).toBe(`script:noproject:${REQUEST_ID}`);
  });
});

describe("refundScriptDebit — kebijakan", () => {
  test("charged (anon) → refund dipanggil dengan period DEBET & kunci ber-requestId", async () => {
    mocks.refundCredit.mockResolvedValue(refunded());

    const result = await refundScriptDebit({
      charge: CHARGED,
      projectId: "p-1",
      identityKey: "anon:dev-1",
      userId: null,
      requestId: REQUEST_ID,
    });

    expect(result).toEqual(refunded());
    expect(mocks.refundCreditForUser).not.toHaveBeenCalled();
    expect(mocks.refundCredit).toHaveBeenCalledTimes(1);
    const [identityKey, opts] = mocks.refundCredit.mock.calls[0];
    expect(identityKey).toBe("anon:dev-1");
    expect(opts.period).toBe("2026-09");              // period debet, bukan currentPeriod()
    expect(opts.idempotencyKey).toBe(`script:p-1:${REQUEST_ID}`);
  });

  test("charged (login) → refundCreditForUser dipanggil, refundCredit tidak", async () => {
    mocks.refundCreditForUser.mockResolvedValue(refunded(11));

    await refundScriptDebit({
      charge: CHARGED,
      projectId: "p-2",
      identityKey: "anon:dev-2",
      userId: "user-2",
      requestId: REQUEST_ID,
    });

    expect(mocks.refundCredit).not.toHaveBeenCalled();
    const [userId, opts] = mocks.refundCreditForUser.mock.calls[0];
    expect(userId).toBe("user-2");
    expect(opts.idempotencyKey).toBe(`script:p-2:${REQUEST_ID}`);
  });

  test("failopen → TIDAK ada refund (tidak ada kredit yang dipotong)", async () => {
    const result = await refundScriptDebit({
      charge: FAILOPEN,
      projectId: "p-1",
      identityKey: "anon:dev-1",
      requestId: REQUEST_ID,
    });

    expect(result).toBeNull();
    expect(mocks.refundCredit).not.toHaveBeenCalled();
    expect(mocks.refundCreditForUser).not.toHaveBeenCalled();
  });

  test("exhausted → TIDAK ada refund", async () => {
    const result = await refundScriptDebit({
      charge: EXHAUSTED,
      projectId: "p-1",
      identityKey: "anon:dev-1",
      requestId: REQUEST_ID,
    });

    expect(result).toBeNull();
    expect(mocks.refundCredit).not.toHaveBeenCalled();
  });

  test("charge null (tidak ada debet) → tidak ada refund", async () => {
    const result = await refundScriptDebit({
      charge: null,
      projectId: "p-1",
      identityKey: "anon:dev-1",
      requestId: REQUEST_ID,
    });

    expect(result).toBeNull();
    expect(mocks.refundCredit).not.toHaveBeenCalled();
  });
});

describe("refundScriptDebit — ketahanan", () => {
  test("hasil -1 (already) → sukses idempoten, tidak throw", async () => {
    mocks.refundCredit.mockResolvedValue({ status: "already", creditsUsed: null });

    const result = await refundScriptDebit({
      charge: CHARGED,
      projectId: "p-1",
      identityKey: "anon:dev-1",
      requestId: REQUEST_ID,
    });

    expect(result?.status).toBe("already");
  });

  test("RPC refund belum deploy (unavailable) → tidak throw", async () => {
    mocks.refundCredit.mockResolvedValue({ status: "unavailable", creditsUsed: null });

    await expect(
      refundScriptDebit({
        charge: CHARGED,
        projectId: "p-1",
        identityKey: "anon:dev-1",
        requestId: REQUEST_ID,
      })
    ).resolves.toEqual({ status: "unavailable", creditsUsed: null });
  });

  test("helper melempar (DB down) → tidak throw, status error", async () => {
    mocks.refundCredit.mockRejectedValue(new Error("network down"));

    const result = await refundScriptDebit({
      charge: CHARGED,
      projectId: "p-1",
      identityKey: "anon:dev-1",
      requestId: REQUEST_ID,
    });

    expect(result).toEqual({ status: "error", creditsUsed: null });
  });
});
