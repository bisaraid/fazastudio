import { test, expect, describe, vi, beforeEach, afterEach } from "vitest";

// ============================================================
// SETUP: env supabase dummy (via vi.hoisted — berjalan SEBELUM
// import service.ts dievaluasi, karena import di-hoist).
// Database nyata tidak dipanggil — semua request di-intercept
// oleh mock fetch global (pola sama seperti trendtracker.test.ts).
// ============================================================

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role";
  process.env.SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_ANON_KEY = "fake-anon";
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getUsage, decrementCredit, checkCredits, setPlan, FREE_CREDITS } from "@/lib/usage";

// ============================================================
// Fake in-memory "user_usage" — emulasi Postgres semantics:
//  - unique (identity_key, period): INSERT..ON CONFLICT DO NOTHING
//  - atomic guarded UPDATE (row-lock) via promise-chain mutex
// ============================================================

interface FakeRow {
  identity_key: string;
  period: string;
  plan: string;
  credits_total: number;
  credits_used: number;
}

class FakeUsageDb {
  rows = new Map<string, FakeRow>();

  key(identityKey: string, period: string) {
    return `${identityKey}|${period}`;
  }

  /** INSERT..ON CONFLICT DO NOTHING + SELECT (idempoten). */
  ensure(identityKey: string, period: string): FakeRow {
    const k = this.key(identityKey, period);
    const existing = this.rows.get(k);
    if (existing) return { ...existing };
    const fresh: FakeRow = {
      identity_key: identityKey,
      period,
      plan: "free",
      credits_total: 10,
      credits_used: 0,
    };
    this.rows.set(k, fresh);
    return { ...fresh };
  }

  /**
   * Emulasi RPC atomic `decrement_credit`:
   *   UPDATE user_usage SET credits_used = credits_used + 1
   *   WHERE credits_used < credits_total RETURNING credits_used
   *
   * Check+increment dalam satu blok SYNCHRONOUS (tanpa await di antara) —
   * JS single-threaded menjamin atomic (mirror Postgres row-lock).
   * Tidak ada promise-chain mutex (artefak lama yang memserialisasi seluruh
   * RPC dan MASKER lost-update bug di fallback).
   */
  decrement(identityKey: string, period: string): Promise<number | null> {
    return Promise.resolve().then(() => {
      const k = this.key(identityKey, period);
      const row = this.rows.get(k);
      if (!row) return null;
      if (row.credits_used >= row.credits_total) return null;
      row.credits_used += 1;
      return row.credits_used;
    });
  }

  all(): FakeRow[] {
    return Array.from(this.rows.values()).map((r) => ({ ...r }));
  }
}

// ============================================================
// Fake fetch handler — menerjemahkan request supabase-js
// ke FakeUsageDb (rpc + dari chain builder).
// ============================================================

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function pgrstError(status: number, code: string, message: string) {
  return new Response(
    JSON.stringify({ code, message, details: message, hint: "" }),
    { status, headers: { "content-type": "application/json" } }
  );
}

function applyFilter(row: FakeRow, key: string, val: string): boolean {
  if (val.startsWith("eq.")) return String(row[key as keyof FakeRow]) === val.slice(3);
  if (val.startsWith("lt.")) return Number(row[key as keyof FakeRow]) < Number(val.slice(3));
  return true;
}

function selectRows(db: FakeUsageDb, url: URL): FakeRow[] {
  let out = db.all();
  for (const [key, val] of Array.from(url.searchParams.entries())) {
    if (key === "select" || key === "order") continue;
    out = out.filter((r) => applyFilter(r, key, val));
  }
  return out;
}
/**
 * Terjemahkan request supabase-js (rpc + from) ke FakeUsageDb.
 * `rpcAvailable=false` → semua RPC dibalas PGRST202 (function not found),
 * memaksa jalur fallback legacy (sebelum migration 014 deploy).
 */
function createFetchHandler(db: FakeUsageDb, rpcAvailable = true) {
  return async (input: any, init: any) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(init.body) : null;
    const path = url.pathname;
    const fn = path.split("/").pop();

    // ---- RPC route ----
    if (path.includes("/rpc/")) {
      if (!rpcAvailable) {
        return pgrstError(
          404,
          "PGRST202",
          `Could not find the function ${fn} in schema cache`
        );
      }
      if (fn === "ensure_usage_row") {
        return jsonResponse(db.ensure(body.p_identity_key, body.p_period));
      }
      if (fn === "decrement_credit") {
        return jsonResponse(await db.decrement(body.p_identity_key, body.p_period));
      }
      return pgrstError(404, "PGRST202", `Could not find the function ${fn}`);
    }

    // ---- PostgREST table route (/rest/v1/user_usage) ----
    if (path.endsWith("/user_usage")) {
      if (method === "GET") {
        const rows = selectRows(db, url);
        if (rows.length === 0) {
          return pgrstError(406, "PGRST116", "The result contains 0 rows");
        }
        return jsonResponse(rows[0]);
      }
      if (method === "POST") {
        if (url.searchParams.get("on_conflict")) {
          // UPSERT (setPlan) — overwrite penuh dengan nilai payload
          db.rows.set(`${body.identity_key}|${body.period}`, {
            identity_key: body.identity_key,
            period: body.period,
            plan: body.plan,
            credits_total: Number(body.credits_total),
            credits_used: Number(body.credits_used),
          });
          return jsonResponse(
            [{ ...db.rows.get(`${body.identity_key}|${body.period}`)! }],
            201
          );
        }
        // INSERT legacy — create jika belum ada (ON CONFLICT DO NOTHING)
        db.ensure(body.identity_key, body.period);
        return jsonResponse([{ ...db.ensure(body.identity_key, body.period) }], 201);
      }
      if (method === "PATCH") {
        // Gunakan row ASLI dari map (bukan copy) agar update persist ke db
        const matches = Array.from(db.rows.values()).filter((r) => {
          for (const [key, val] of Array.from(url.searchParams.entries())) {
            if (key === "select" || key === "order") continue;
            if (!applyFilter(r, key, val)) return false;
          }
          return true;
        });
        for (const row of matches) {
          for (const [col, val] of Object.entries(body)) {
            (row as any)[col] = val;
          }
        }
        return jsonResponse(matches);
      }
    }

    return jsonResponse(null);
  };
}

// ============================================================
// TESTS
// ============================================================

let db: FakeUsageDb;

beforeEach(() => {
  db = new FakeUsageDb();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("usage credit system — ATOMIC (migration 014)", () => {
  beforeEach(() => {
    mockFetch.mockImplementation(createFetchHandler(db, true));
  });

  test("getUsage: baris baru dibangun dengan free plan 10 kredit", async () => {
    const usage = await getUsage("anon:test");
    expect(usage.plan).toBe("free");
    expect(usage.creditsTotal).toBe(FREE_CREDITS);
    expect(usage.creditsUsed).toBe(0);
    expect(usage.creditsRemaining).toBe(10);
  });

  test("decrementCredit sukses → true & credits_used +1", async () => {
    await getUsage("anon:test");
    const ok = await decrementCredit("anon:test");

    expect(ok).toBe(true);
    expect(db.all()[0].credits_used).toBe(1);
  });

  test("decrementCredit kuota habis → false (RETURNING kosong = null)", async () => {
    await getUsage("anon:test");
    for (let i = 0; i < FREE_CREDITS; i++) {
      expect(await decrementCredit("anon:test")).toBe(true);
    }
    expect(await decrementCredit("anon:test")).toBe(false);
    expect(db.all()[0].credits_used).toBe(FREE_CREDITS);
  });

  test("RACE CONDITION: 20 request concurrent dengan kuota 10 → maksimal 10 sukses", async () => {
    await getUsage("anon:race");

    const results = await Promise.all(
      Array.from({ length: 20 }, () => decrementCredit("anon:race"))
    );

    const success = results.filter((r) => r === true).length;
    const failed = results.filter((r) => r === false).length;

    expect(success).toBe(FREE_CREDITS);
    expect(failed).toBe(20 - FREE_CREDITS);
    expect(db.all()[0].credits_used).toBe(FREE_CREDITS);
    expect(db.all()[0].credits_used).toBeLessThanOrEqual(
      db.all()[0].credits_total
    );
  });

  test("checkCredits: true saat masih ada kredit, false saat habis", async () => {
    await getUsage("anon:test");
    expect(await checkCredits("anon:test")).toBe(true);

    for (let i = 0; i < FREE_CREDITS; i++) {
      await decrementCredit("anon:test");
    }
    expect(await checkCredits("anon:test")).toBe(false);
  });

  test("setPlan: upgrade ke pro → total 100, used reset 0", async () => {
    await getUsage("anon:paying");
    await decrementCredit("anon:paying");

    const ok = await setPlan("anon:paying", "pro");
    expect(ok).toBe(true);

    const row = db.all().find((r) => r.identity_key === "anon:paying")!;
    expect(row.plan).toBe("pro");
    expect(row.credits_total).toBe(100);
    expect(row.credits_used).toBe(0);
  });
});
describe("usage credit system — FALLBACK (RPC belum deploy / PGRST202)", () => {
  beforeEach(() => {
    mockFetch.mockImplementation(createFetchHandler(db, false));
  });

  test("fetchOrCreate fallback: legacy get-then-insert tetap berfungsi", async () => {
    const usage = await getUsage("anon:legacy");
    expect(usage.creditsTotal).toBe(FREE_CREDITS);
    expect(usage.creditsUsed).toBe(0);
  });

  test("decrementCredit fallback guarded: TIDAK overspend saat kuota habis", async () => {
    await getUsage("anon:legacy");

    for (let i = 0; i < FREE_CREDITS; i++) {
      expect(await decrementCredit("anon:legacy")).toBe(true);
    }
    // Kuota habis → fallback .lt("credits_used", total) tidak match
    expect(await decrementCredit("anon:legacy")).toBe(false);
    expect(db.all()[0].credits_used).toBe(FREE_CREDITS);
  });
test("FALLBACK TRUE-CONCURRENCY: 20 request parallel tanpa RPC → max 10 sukses (CAS anti-lost-update)", async () => {
    await getUsage("anon:cas");

    // 20 request simulaan; fake PATCH mirrow live-row update (synchronous,
    // tanpa serialisace) — CAS `.eq("credits_used", nilai-baca)` harus
    // menghindar lost-update: exact FREE_CREDITS sukses, tidak overspend.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => decrementCredit("anon:cas"))
    );

    const success = results.filter((r) => r === true).length;
    const failed = results.filter((r) => r === false).length;

    expect(success).toBe(FREE_CREDITS);
    expect(failed).toBe(20 - FREE_CREDITS);

    const row = db.all().find((r) => r.identity_key === "anon:cas")!;
    expect(row.credits_used).toBe(FREE_CREDITS);
    expect(row.credits_used).toBeLessThanOrEqual(row.credits_total);
  });
});