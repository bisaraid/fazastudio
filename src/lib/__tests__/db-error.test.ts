import { test, expect, describe } from "vitest";

// ============================================================
// Regresi bug "Gagal memperbarui plan" (2026-09-30):
// penyebab teknis HARUS terbaca di log, tapi TANPA PII.
// Modul ini adalah satu-satunya jalur penulisan error DB ke log.
// ============================================================

import {
  describeSupabaseError,
  formatSupabaseError,
  maskId,
  newLogRef,
  redactPii,
} from "@/lib/db-error";

const USER_UUID = "cffd1283-e3c4-49d8-ad34-2e6b6109e93d";
const EMAIL = "akunjobside@gmail.com";

describe("redactPii", () => {
  test("email, uuid, dan token JWT diganti penanda aman", () => {
    const out = redactPii(
      `Key (user_id, period)=(${USER_UUID}, 2026-09) already exists — ` +
        `hubungi ${EMAIL} dengan token eyJhbGciOiJIUzI1NiJ9.abcdefgh.ijklmnop`
    );

    expect(out).not.toContain(USER_UUID);
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(out).toContain("[uuid]");
    expect(out).toContain("[email]");
    expect(out).toContain("[token]");
  });

  test("pesan polos tanpa PII tidak diubah", () => {
    const msg =
      'null value in column "identity_key" of relation "user_usage" violates not-null constraint';
    expect(redactPii(msg)).toBe(msg);
  });

  test("objek non-string tidak dicetak isinya", () => {
    expect(redactPii({ email: EMAIL })).toBe("[object]");
    expect(redactPii(null)).toBe("");
    expect(redactPii(undefined)).toBe("");
  });
});

describe("describeSupabaseError", () => {
  test("error PostgREST → code/message/details/hint apa adanya (ter-redaksi)", () => {
    const info = describeSupabaseError({
      code: "23502",
      message:
        'null value in column "identity_key" of relation "user_usage" violates not-null constraint',
      details: `Failing row contains (${USER_UUID}, null, 2026-09).`,
      hint: `Email pemilik: ${EMAIL}`,
    });

    expect(info.code).toBe("23502");
    expect(info.message).toContain("identity_key");
    expect(info.details).toContain("[uuid]");
    expect(info.details).not.toContain(USER_UUID);
    expect(info.hint).toContain("[email]");
    expect(info.hint).not.toContain(EMAIL);
  });

  test("field kosong / tidak ada → null (log seragam)", () => {
    const info = describeSupabaseError({ code: "PGRST202", message: "nope", details: "", hint: "  " });
    expect(info).toMatchObject({ code: "PGRST202", details: null, hint: null });
  });

  test("error tanpa code → 'unknown'; error dilempar → 'uncaught_error'", () => {
    expect(describeSupabaseError({ message: "boom" }).code).toBe("unknown");
    expect(describeSupabaseError(null).code).toBe("unknown");
    expect(describeSupabaseError(new Error("connect ECONNREFUSED")).code).toBe("uncaught_error");
    expect(describeSupabaseError({ code: "ECONNRESET", message: "socket hang up" }).code).toBe(
      "ECONNRESET"
    );
  });

  test("kegagalan fetch ala supabase-js (code kosong + message 'Error: …') → fetch_failed", () => {
    // Bentuk asli dari supabase-js saat fetch gagal (diverifikasi terhadap
    // package: code "", message = String(err), details = stack).
    const info = describeSupabaseError({
      code: "",
      message: "Error: fetch failed: connect ECONNREFUSED",
      details: "Error: fetch failed\n    at globalThis.fetch (file:///app/next/dist/x.js)",
      hint: "",
    });

    expect(info.code).toBe("fetch_failed");
    expect(info.message).toContain("ECONNREFUSED");
    expect(info.details).toContain("at globalThis.fetch");
    expect(info.hint).toBeNull();
  });
});

describe("formatSupabaseError", () => {
  test("memuat code, message, details, hint dalam satu baris", () => {
    const line = formatSupabaseError({
      code: "42P10",
      message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      details: null,
      hint: "buat unique index (user_id, period)",
    });

    expect(line).toContain("code=42P10");
    expect(line).toContain("message=there is no unique");
    expect(line).toContain("details=null");
    expect(line).toContain("hint=buat unique index");
  });

  test("tetap meredaksi walau diberi info yang belum bersih", () => {
    const line = formatSupabaseError({
      code: "23505",
      message: `Key (user_id, period)=(${USER_UUID}, 2026-09) already exists.`,
      details: null,
      hint: EMAIL,
    });

    expect(line).not.toContain(USER_UUID);
    expect(line).not.toContain(EMAIL);
    expect(line).toContain("[uuid]");
    expect(line).toContain("[email]");
  });

  test("info null → placeholder aman", () => {
    expect(formatSupabaseError(null)).toBe(
      "code=unknown message=(tidak ada error) details=null hint=null"
    );
  });
});

describe("maskId & newLogRef", () => {
  test("maskId hanya menyisakan awalan id", () => {
    expect(maskId(USER_UUID)).toBe("cffd1283…");
    expect(maskId(USER_UUID)).not.toContain(USER_UUID);
    expect(maskId("abc")).toBe("abc…");
    expect(maskId("")).toBe("(kosong)");
    expect(maskId(undefined)).toBe("(kosong)");
  });

  test("newLogRef berformat prefix-random dan tidak sama antar panggilan", () => {
    const a = newLogRef();
    const b = newLogRef();
    expect(a).toMatch(/^sp-[a-z0-9]{8}$/);
    expect(newLogRef("x")).toMatch(/^x-/);
    expect(a).not.toBe(b);
  });
});
