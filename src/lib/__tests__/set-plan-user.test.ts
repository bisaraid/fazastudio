import { test, expect, describe, beforeEach, afterEach, vi } from "vitest";

// ============================================================
// Regresi bug "Gagal memperbarui plan" di /admin/transaksi (2026-09-30):
// user SUDAH terdaftar (lookup ok) tapi penulisan plan gagal 500.
//
// Akar masalah: baris `user_usage` jalur akun tidak pernah bisa dibuat karena
// `identity_key` (`not null` sejak migration 003) tidak pernah diisi.
//
// Yang dijaga di sini:
//  1. baris sudah ada → UPDATE saja (plan + kuota, used reset 0),
//  2. baris belum ada → INSERT dengan identity_key terisi, walaupun server
//     masih menegakkan `not null` (migration 028 belum dijalankan),
//  3. error Supabase (23502/42501/…) → ok=false + code/message/details/hint
//     terbawa apa adanya, tercatat di log TANPA PII,
//  4. balapan concurrent (23505) → retry UPDATE, tetap sukses,
//  5. error jaringan (throw) → ok=false, tidak melempar ke route.
// Semua I/O dimock lewat global fetch — tanpa jaringan/DB.
// ============================================================

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role";
  process.env.SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_ANON_KEY = "fake-anon";
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { accountIdentityKey, setPlanForUser, setPlanForUserDetailed } from "@/lib/usage";

const USER = "cffd1283-e3c4-49d8-ad34-2e6b6109e93d";
const EMAIL = "akunjobside@gmail.com";
const NOW = new Date();
const PERIOD = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, "0")}`;

interface FakeRow {
  id: string;
  user_id: string;
  identity_key: string | null;
  period: string;
  plan: string;
  credits_total: number;
  credits_used: number;
  updated_at?: string;
}

interface FakeErrorBody {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

const db = {
  rows: [] as FakeRow[],
  /** Menegakkan constraint migration 003 (identity_key not null). */
  identityKeyNotNull: true,
  /** Error untuk PATCH (update). */
  patchError: null as { status: number; body: FakeErrorBody } | null,
  /** Error berurutan untuk POST (insert). */
  insertErrors: [] as FakeErrorBody[],
  /** Balapan: baris dibuat "proses lain" tepat sebelum INSERT kita. */
  raceOnInsert: false,
  /** Simulasi jaringan mati (promise throw, bukan error PostgREST). */
  networkThrow: null as string | null,
  inserts: 0,
  updates: 0,
  lastInsert: null as Record<string, unknown> | null,
};

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status: number, body: FakeErrorBody) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Terjemahkan request supabase-js (from("user_usage")) ke FakeDb. */
function handler(input: any, init: any) {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init?.method || "GET").toUpperCase();
  const body = init?.body ? JSON.parse(init.body) : null;

  if (db.networkThrow) throw new Error(db.networkThrow);
  if (!url.pathname.endsWith("/user_usage")) return jsonResponse([], 200);

  const param = (name: string) =>
    url.searchParams.get(name)?.replace(/^eq\./, "") ?? null;

  if (method === "PATCH") {
    db.updates += 1;
    if (db.patchError) return errorResponse(db.patchError.status, db.patchError.body);
    const matched = db.rows.filter(
      (r) => r.user_id === param("user_id") && r.period === param("period")
    );
    for (const row of matched) Object.assign(row, body);
    return jsonResponse(matched.map((r) => ({ id: r.id })));
  }

  if (method === "POST") {
    db.inserts += 1;
    db.lastInsert = body;

    const queued = db.insertErrors.shift();
    if (queued) return errorResponse(409, queued);

    if (db.raceOnInsert) {
      db.rows.push({
        id: "row-race",
        user_id: body.user_id,
        identity_key: body.identity_key ?? null,
        period: body.period,
        plan: "free",
        credits_total: 10,
        credits_used: 3,
      });
      return errorResponse(409, {
        code: "23505",
        message: 'duplicate key value violates unique constraint "uq_user_usage_user_period"',
        details: null,
        hint: null,
      });
    }

    // Constraint migration 003: identity_key not null (tanpa default).
    if (db.identityKeyNotNull && (body.identity_key ?? null) === null) {
      return errorResponse(400, {
        code: "23502",
        message:
          'null value in column "identity_key" of relation "user_usage" violates not-null constraint',
        details: null,
        hint: null,
      });
    }

    db.rows.push({
      id: `row-${db.rows.length + 1}`,
      user_id: body.user_id,
      identity_key: body.identity_key ?? null,
      period: body.period,
      plan: body.plan,
      credits_total: Number(body.credits_total),
      credits_used: Number(body.credits_used),
      updated_at: body.updated_at,
    });
    return jsonResponse(null, 201);
  }

  return jsonResponse([], 200);
}

const rowFor = (userId = USER) =>
  db.rows.find((r) => r.user_id === userId && r.period === PERIOD);

beforeEach(() => {
  db.rows = [];
  db.identityKeyNotNull = true;
  db.patchError = null;
  db.insertErrors = [];
  db.raceOnInsert = false;
  db.networkThrow = null;
  db.inserts = 0;
  db.updates = 0;
  db.lastInsert = null;
  mockFetch.mockImplementation(handler);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setPlanForUserDetailed — jalur tulis plan akun", () => {
  test("baris periode berjalan sudah ada → UPDATE saja, plan+kuota ter-set, used reset 0", async () => {
    db.rows.push({
      id: "row-1",
      user_id: USER,
      identity_key: accountIdentityKey(USER),
      period: PERIOD,
      plan: "free",
      credits_total: 10,
      credits_used: 7,
    });

    const res = await setPlanForUserDetailed(USER, "pro");

    expect(res).toEqual({ ok: true, stage: "update", error: null });
    expect(db.inserts).toBe(0);
    expect(rowFor()).toMatchObject({ plan: "pro", credits_total: 100, credits_used: 0 });
  });

  test("baris belum ada → INSERT dengan identity_key terisi (anti 23502) + plan benar", async () => {
    const res = await setPlanForUserDetailed(USER, "starter");

    expect(res).toEqual({ ok: true, stage: "insert", error: null });
    expect(db.inserts).toBe(1);
    // Inti regresi: kolom `not null` identity_key WAJIB ikut terkirim.
    expect(db.lastInsert).toMatchObject({
      user_id: USER,
      identity_key: "account:" + USER,
      period: PERIOD,
      plan: "starter",
      credits_total: 30,
      credits_used: 0,
    });
    expect(rowFor()).toMatchObject({ plan: "starter", credits_total: 30, credits_used: 0 });
  });

  test("Supabase menolak NOT NULL (23502) → ok=false + code/message/details/hint terbawa, log tanpa PII", async () => {
    db.insertErrors.push({
      code: "23502",
      message:
        'null value in column "identity_key" of relation "user_usage" violates not-null constraint',
      details: `Failing row contains (${USER}, null, ${PERIOD}).`,
      hint: "jalankan migration 028_usage_account_row_fix.sql",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await setPlanForUserDetailed(USER, "pro");

    expect(res.ok).toBe(false);
    expect(res.stage).toBe("insert");
    expect(res.error?.code).toBe("23502");
    expect(res.error?.message).toContain("identity_key");
    expect(res.error?.hint).toContain("028");
    // details memuat uuid user → diredaksi
    expect(res.error?.details).toContain("[uuid]");
    expect(res.error?.details).not.toContain(USER);

    const log = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(log).toContain("[usage] setPlanForUser gagal");
    expect(log).toContain("stage=insert");
    expect(log).toContain("code=23502");
    expect(log).toContain("message=null value in column");
    expect(log).toContain("hint=jalankan migration 028");
    expect(log).toContain(USER.slice(0, 8)); // user di-masker, bukan disembunyikan total
    expect(log).not.toContain(USER);
  });

  test("error saat UPDATE (42501 permission denied) → ok=false, stage=update, log tanpa email/uuid", async () => {
    db.patchError = {
      status: 403,
      body: {
        code: "42501",
        message: "permission denied for table user_usage",
        details: `role=kunci-salah pemilik=${USER}`,
        hint: `hubungi ${EMAIL}`,
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await setPlanForUserDetailed(USER, "pro");

    expect(res.ok).toBe(false);
    expect(res.stage).toBe("update");
    expect(res.error?.code).toBe("42501");
    expect(db.inserts).toBe(0);

    const log = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(log).toContain("stage=update");
    expect(log).toContain("code=42501");
    expect(log).toContain("details=role=kunci-salah pemilik=[uuid]");
    expect(log).toContain("hint=hubungi [email]");
    expect(log).not.toContain(EMAIL);
    expect(log).not.toContain(USER);
  });

  test("balapan concurrent (INSERT 23505) → UPDATE diulang & sukses", async () => {
    db.raceOnInsert = true;

    const res = await setPlanForUserDetailed(USER, "pro");

    expect(res).toEqual({ ok: true, stage: "update", error: null });
    expect(db.inserts).toBe(1);
    expect(db.updates).toBe(2); // UPDATE awal (0 baris) + retry setelah 23505
    expect(rowFor()).toMatchObject({ plan: "pro", credits_total: 100, credits_used: 0 });
  });

  test("jaringan mati → ok=false code=fetch_failed, tidak melempar ke route", async () => {
    db.networkThrow = "fetch failed: connect ECONNREFUSED";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await setPlanForUserDetailed(USER, "pro");

    expect(res.ok).toBe(false);
    expect(res.stage).toBe("update");
    // supabase-js membungkus error fetch tanpa kode Postgres → ditandai fetch_failed
    expect(res.error?.code).toBe("fetch_failed");
    expect(res.error?.message).toContain("ECONNREFUSED");

    const log = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(log).toContain("stage=update");
    expect(log).toContain("code=fetch_failed");
    expect(log).toContain("message=Error: fetch failed: connect ECONNREFUSED");
  });

  test("wrapper boolean setPlanForUser tetap kompatibel (webhook & route lama)", async () => {
    expect(await setPlanForUser(USER, "pro")).toBe(true);

    db.patchError = { status: 500, body: { code: "42P01", message: "relation does not exist" } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await setPlanForUser(USER, "pro")).toBe(false);
    expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("code=42P01");
  });
});


