import { test, expect, describe } from "vitest";
import {
  NETWORK_ERROR_MESSAGE,
  UNKNOWN_ERROR_MESSAGE,
  setPlanErrorMessage,
} from "@/lib/set-plan-error";

// ============================================================
// src/lib/set-plan-error.ts — pesan UI /admin/transaksi.
//
// Kontrak utama (diminta pada perbaikan bug 2026-09-30): UI HARUS
// membedakan "email belum terdaftar" (salah input, bukan salah server)
// dari "gagal menghubungi server" (masalah infrastruktur).
// ============================================================

describe("setPlanErrorMessage", () => {
  test("code user_not_found → pesan 'belum terdaftar' dari server", () => {
    const msg = setPlanErrorMessage(
      {
        code: "user_not_found",
        error: "Email budi@example.com belum terdaftar sebagai user. Pastikan user sudah mendaftar.",
      },
      404
    );

    expect(msg).toContain("belum terdaftar");
    expect(msg).not.toMatch(/gagal menghubungi/i);
  });

  test("code auth_lookup_failed → pesan gangguan server, bukan 'tidak ditemukan'", () => {
    const msg = setPlanErrorMessage(
      {
        code: "auth_lookup_failed",
        error: "Gagal menghubungi layanan Auth untuk mencari user. Coba lagi sebentar lagi.",
      },
      500
    );

    expect(msg).toMatch(/gagal menghubungi/i);
    expect(msg).not.toMatch(/belum terdaftar/i);
  });

  test("dua keadaan itu TIDAK memakai pesan yang sama", () => {
    const notFound = setPlanErrorMessage(
      { code: "user_not_found", error: "Email X belum terdaftar." },
      404
    );
    const serverDown = setPlanErrorMessage(
      { code: "auth_lookup_failed", error: "Gagal menghubungi layanan Auth." },
      500
    );

    expect(notFound).not.toBe(serverDown);
  });

  test("body null + status HTTP → pesan gangguan server, bukan 'belum terdaftar'", () => {
    for (const status of [500, 502, 504]) {
      const msg = setPlanErrorMessage(null, status);
      expect(msg).toContain(UNKNOWN_ERROR_MESSAGE);
      expect(msg).toContain(String(status));
    }
  });

  test("fetch reject (server tak terjangkau) → pesan jaringan tetap", () => {
    expect(setPlanErrorMessage(null)).toBe(NETWORK_ERROR_MESSAGE);
    expect(NETWORK_ERROR_MESSAGE).toMatch(/koneksi/i);
  });

  test("code plan_write_failed → pesan server (dengan kode referensi), bukan 'tidak ditemukan'", () => {
    const msg = setPlanErrorMessage(
      {
        code: "plan_write_failed",
        ref: "sp-ab12cd34",
        error:
          "Gagal menyimpan plan ke database (kode sp-ab12cd34). Hubungi admin/dev dan sebutkan kode ini.",
      },
      500
    );

    expect(msg).toContain("Gagal menyimpan plan ke database");
    expect(msg).toContain("sp-ab12cd34");
    expect(msg).not.toMatch(/belum terdaftar/i);
    // Detail internal tidak boleh muncul di UI.
    expect(msg).not.toContain("23502");
    expect(msg).not.toContain("identity_key");
  });

  test("code plan_write_failed tanpa pesan server → fallback yang tetap jelas", () => {
    const msg = setPlanErrorMessage({ code: "plan_write_failed" }, 500);
    expect(msg).toContain("Gagal menyimpan plan ke database");
    expect(msg).toContain("admin/dev");
  });

  test("tanpa code: pakai pesan server bila ada, jika tidak pesan generik", () => {
    expect(setPlanErrorMessage({ error: "Plan tidak valid" }, 400)).toBe("Plan tidak valid");
    expect(setPlanErrorMessage({}, 500)).toContain(UNKNOWN_ERROR_MESSAGE);
    expect(setPlanErrorMessage({})).toBe("Aktivasi gagal. Coba lagi.");
  });
});
