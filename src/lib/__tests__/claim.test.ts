import { test, expect, describe, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

// ============================================================
// C5 — klaim data anon -> akun setelah login (Opsi 1 & 2).
//
// Mock "@/lib/supabase/service" AKTIF sejak perbaikan vi.mock
// (vitest 3.2.7 + vitest.setup.ts, lihat TESTING.md).
// Fake in-memory user_usage mem-mirror semantik SQL RPC
// `claim_usage_to_user` (migration 018): re-key / merge dengan
// prioritas plan pro > starter > free.
// ============================================================

interface UsageRow {
  id: string;
  user_id: string | null;
  identity_key: string | null;
  period: string;
  plan: string;
  credits_total: number;
  credits_used: number;
}

interface ProjectRow {
  id: string;
  identity_key: string;
  user_id: string | null;
}

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<[string, string, unknown]>;
}

const PERIOD = "2026-09";

const fake = {
  usage: [] as UsageRow[],
  projects: [] as ProjectRow[],
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  updateCalls: [] as UpdateCall[],
  /** Kalau di-set, semua RPC gagal → memaksa jalur fallback claim.ts. */
  rpcError: null as Error | null,
};

let rowSeq = 0;

function seedUsage(partial: Partial<UsageRow>): UsageRow {
  const row: UsageRow = {
    id: `row-${++rowSeq}`,
    user_id: null,
    identity_key: null,
    period: PERIOD,
    plan: "free",
    credits_total: 10,
    credits_used: 0,
    ...partial,
  };
  fake.usage.push(row);
  return row;
}

const planPriority = (plan: string) => (plan === "pro" ? 3 : plan === "starter" ? 2 : 1);

/**
 * Port JS dari RPC `claim_usage_to_user` (migration 018, baris 135-191):
 * - baris anon tanpa pasangan di akun  → re-key (plan & kredit ikut);
 * - baris akun sudah ada → merge: used = min(total, used+used), total = max,
 *   plan hanya diganti bila plan anon LEBIH TINGGI; baris anon dihapus.
 */
function fakeClaimUsageToUser(userId: string, identityKey: string): number {
  const anonRows = fake.usage.filter(
    (r) => r.identity_key === identityKey && r.user_id === null
  );
  let claimed = 0;
  for (const r of anonRows) {
    const target = fake.usage.find((t) => t.user_id === userId && t.period === r.period);
    if (!target) {
      r.user_id = userId;
    } else {
      target.credits_used = Math.min(
        target.credits_total,
        target.credits_used + r.credits_used
      );
      target.credits_total = Math.max(target.credits_total, r.credits_total);
      if (planPriority(r.plan) > planPriority(target.plan)) target.plan = r.plan;
      fake.usage.splice(fake.usage.indexOf(r), 1);
    }
    claimed++;
  }
  return claimed;
}

/** Builder thenable ala supabase-js: .from(t).update(p).eq(c,v).is(c,v) */
function makeUpdateChain(table: string) {
  const call: UpdateCall = { table, payload: {}, filters: [] };
  const exec = async () => {
    fake.updateCalls.push(call);
    const matches = (row: Record<string, unknown>) =>
      call.filters.every(([op, col, val]) =>
        op === "eq" ? row[col] === val : op === "is" ? row[col] === val : true
      );
    const rows: Array<Record<string, unknown>> =
      table === "projects"
        ? (fake.projects as unknown as Array<Record<string, unknown>>)
        : (fake.usage as unknown as Array<Record<string, unknown>>);
    for (const row of rows) {
      if (matches(row)) Object.assign(row, call.payload);
    }
    return { error: null };
  };
  const chain: Record<string, unknown> = {};
  const c = chain as {
    update: (p: Record<string, unknown>) => Record<string, unknown>;
    eq: (col: string, val: unknown) => Record<string, unknown>;
    is: (col: string, val: unknown) => Record<string, unknown>;
    then: (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown
    ) => Promise<unknown>;
  };
  c.update = (payload) => {
    call.payload = payload;
    return chain;
  };
  c.eq = (col, val) => {
    call.filters.push(["eq", col, val]);
    return chain;
  };
  c.is = (col, val) => {
    call.filters.push(["is", col, val]);
    return chain;
  };
  c.then = (onFulfilled, onRejected) => exec().then(onFulfilled, onRejected);
  return chain;
}


vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => makeUpdateChain(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      fake.rpcCalls.push({ name, args });
      if (fake.rpcError) return { data: null, error: fake.rpcError };
      if (name === "claim_usage_to_user") {
        const claimed = fakeClaimUsageToUser(
          args.p_user_id as string,
          args.p_identity_key as string
        );
        return { data: claimed, error: null };
      }
      return { data: null, error: new Error(`RPC tak dikenal: ${name}`) };
    },
  }),
}));

import { claimDeviceDataToUser } from "@/lib/claim";

beforeEach(() => {
  fake.usage = [];
  fake.projects = [];
  fake.rpcCalls = [];
  fake.updateCalls = [];
  fake.rpcError = null;
  rowSeq = 0;
});

describe("C5 — claim pasca login (claimDeviceDataToUser)", () => {
  test("bayar-tamu-lalu-login: plan pro baris anon terbawa ke akun; idempoten", async () => {
    // Tamu membayar pro (order legacy anon:) → baris anon plan=pro.
    seedUsage({
      identity_key: "anon:device-1",
      user_id: null,
      plan: "pro",
      credits_total: 100,
      credits_used: 7,
    });
    // Akun baru login: baris akun masih free + sudah terpakai 3.
    const acct = seedUsage({ user_id: "user-1", plan: "free", credits_total: 10, credits_used: 3 });
    fake.projects.push({ id: "p1", identity_key: "anon:device-1", user_id: null });

    const res = await claimDeviceDataToUser("user-1", "anon:device-1");

    expect(res).toEqual({ claimedProjects: true, claimedUsage: true });

    // Plan bayar-tamu naik ke akun; merge kredit: total=max, used=min(total, sum).
    expect(acct.plan).toBe("pro");
    expect(acct.credits_total).toBe(100);
    expect(acct.credits_used).toBe(10); // min(100, 3 + 7)

    // Baris anon habis; proyek pindah ke akun.
    expect(
      fake.usage.some((r) => r.user_id === null && r.identity_key === "anon:device-1")
    ).toBe(false);
    expect(fake.projects[0].user_id).toBe("user-1");

    // RPC dipanggil dengan parameter benar (bukan sekadar update buta).
    expect(fake.rpcCalls).toEqual([
      {
        name: "claim_usage_to_user",
        args: { p_user_id: "user-1", p_identity_key: "anon:device-1" },
      },
    ]);

    // Idempoten: klaim ulang TIDAK menggandakan kredit / merusak plan.
    const res2 = await claimDeviceDataToUser("user-1", "anon:device-1");
    expect(res2).toEqual({ claimedProjects: true, claimedUsage: true });
    expect(acct.credits_used).toBe(10);
    expect(acct.plan).toBe("pro");
  });


  test("proteksi plan lebih tinggi: akun pro TIDAK ditimpa plan anon lebih rendah", async () => {
    // Akun sudah pro (bayar lewat akun); perangkat anon plan starter login.
    seedUsage({
      identity_key: "anon:device-1",
      user_id: null,
      plan: "starter",
      credits_total: 50,
      credits_used: 5,
    });
    const acct = seedUsage({ user_id: "user-1", plan: "pro", credits_total: 100, credits_used: 20 });

    await claimDeviceDataToUser("user-1", "anon:device-1");

    expect(acct.plan).toBe("pro"); // TIDAK turun ke starter
    expect(acct.credits_total).toBe(100); // max(100, 50)
    expect(acct.credits_used).toBe(25); // min(100, 20 + 5)
    expect(fake.usage.filter((r) => r.identity_key === "anon:device-1")).toHaveLength(0);
  });

  test("fallback (RPC 018 belum deploy): HANYA menyentuh baris user_id NULL", async () => {
    fake.rpcError = new Error("PGRST202: function not found");
    seedUsage({
      identity_key: "anon:device-1",
      user_id: null,
      plan: "starter",
      credits_total: 50,
      credits_used: 5,
    });
    const acct = seedUsage({ user_id: "user-1", plan: "pro", credits_total: 100, credits_used: 20 });

    const res = await claimDeviceDataToUser("user-1", "anon:device-1");

    expect(res).toEqual({ claimedProjects: true, claimedUsage: true });

    // Fallback update wajib difilter: eq(identity_key) + is(user_id, null).
    const usageUpdates = fake.updateCalls.filter((c) => c.table === "user_usage");
    expect(usageUpdates).toHaveLength(1);
    expect(usageUpdates[0].filters).toEqual([
      ["eq", "identity_key", "anon:device-1"],
      ["is", "user_id", null],
    ]);

    // Baris akun pro tidak tersentuh fallback (tidak ada update tanpa filter null).
    expect(acct.plan).toBe("pro");
    expect(acct.credits_used).toBe(20);
  });

  test("tanpa identityKey → no-op, tidak menyentuh DB", async () => {
    const res = await claimDeviceDataToUser("user-1", null);
    expect(res).toBeUndefined();
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.updateCalls).toHaveLength(0);
  });
});

describe("C5 — wiring route (guard regresi via source)", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

  test("auth/callback memanggil claimFromRequest di kedua jalur login (OAuth + OTP)", () => {
    const src = read("src/app/auth/callback/route.ts");
    // Dua cabang: exchangeCodeForSession (Google OAuth) & verifyOtp (Email OTP).
    expect(src.match(/claimFromRequest\(/g)?.length).toBeGreaterThanOrEqual(2);
    // Klaim tidak boleh menjatuhkan login — wajib dibungkus try/catch.
    expect(src).toContain("[callback] claim gagal:");
  });

  test("checkout mengikat order_id ke user.id (bukan device cookie)", () => {
    const src = read("src/app/api/checkout/route.ts");
    expect(src).toContain("b64urlEncode(user.id)");
    expect(src).not.toContain("b64urlEncode(identityKey)");
  });
});