import { test, expect, describe, beforeEach, vi } from "vitest";

// ============================================================
// Logika onboarding (dipakai /mulai + middleware) — semua I/O
// dimock, tanpa jaringan/DB.
//
// Tiga skenario utama yang dijaga:
//  1. simpan SUKSES            → wizard punya jalan keluar (navigasi keras)
//  2. simpan GAGAL             → pesan jelas + bisa coba lagi / lewati
//  3. user sudah punya profil  → dikenali "sudah lengkap" (tanpa loop)
// ============================================================

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  EMPTY_PERSONA,
  HOME_AFTER_ONBOARDING,
  isOnboardingComplete,
  navigateTo,
  normalizeNextPath,
  personaFromProfile,
  personaRequestBody,
  savePersona,
  type PersonaAnswers,
} from "@/lib/onboarding";

const ANSWERS: PersonaAnswers = {
  mode: "konten",
  niche: "mistis",
  gaya: "pendongeng-pelan",
  cerita: "bangun-suasana",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("savePersona — simpan sukses", () => {
  test("POST ke /api/profile dengan body camelCase 4 layer", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true, data: {} }));

    const result = await savePersona(ANSWERS);

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/profile");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(personaRequestBody(ANSWERS));
    expect(personaRequestBody(ANSWERS)).toEqual({
      layer1Mode: "konten",
      nicheSlug: "mistis",
      gayaKey: "pendongeng-pelan",
      ceritaKey: "bangun-suasana",
    });
  });

  test("200 tapi success:false → dianggap gagal (tidak pernah 'diam-diam sukses')", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: false }, 200));

    const result = await savePersona(ANSWERS);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("200");
  });
});


describe("savePersona — simpan gagal (pesan harus terlihat jelas)", () => {
  test("500 dengan pesan server → pesan server dipakai & retryable true", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ success: false, error: "Gagal menyimpan profil" }, 500)
    );

    const result = await savePersona(ANSWERS);

    expect(result).toEqual({ ok: false, error: "Gagal menyimpan profil", retryable: true });
  });

  test("400 validasi → retryable false (coba lagi tidak akan menolong)", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: false, error: "Bad request" }, 400));

    const result = await savePersona(ANSWERS);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Bad request");
      expect(result.retryable).toBe(false);
    }
  });

  test("body BUKAN JSON (mis. HTML error) → pesan terbaca, tidak throw", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    } as unknown as Response);

    const result = await savePersona(ANSWERS);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("502");
      expect(result.retryable).toBe(true);
    }
  });

  test("jaringan mati (fetch throw) → pesan jaringan + retryable", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await savePersona(ANSWERS);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/jaringan/i);
      expect(result.retryable).toBe(true);
    }
  });

  test("server menggantung → dibatalkan timeout, tombol tidak loading selamanya", async () => {
    mockFetch.mockImplementation((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const result = await savePersona(ANSWERS, { timeoutMs: 5 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/terlalu lama/i);
      expect(result.retryable).toBe(true);
    }
  });

describe("user sudah punya profil/plan", () => {
  test("profil lengkap dari API → persona terbaca & isOnboardingComplete true", () => {
    const persona = personaFromProfile({
      user_id: "u1",
      layer1_mode: "konten",
      niche_slug: "mistis",
      gaya_key: "pendongeng-pelan",
      cerita_key: "bangun-suasana",
    });

    expect(persona).toEqual(ANSWERS);
    expect(isOnboardingComplete(persona)).toBe(true);
  });

  test("baris null / kolom kosong / spasi saja → BELUM lengkap (gate tidak lolos)", () => {
    expect(personaFromProfile(null)).toEqual(EMPTY_PERSONA);
    expect(isOnboardingComplete(null)).toBe(false);
    expect(isOnboardingComplete(EMPTY_PERSONA)).toBe(false);
    expect(isOnboardingComplete({ ...ANSWERS, cerita: "   " })).toBe(false);
    expect(isOnboardingComplete({ ...ANSWERS, mode: "" })).toBe(false);
  });

  test("kolom DB null/tipe aneh dibaca sebagai string kosong, bukan 'undefined'", () => {
    const persona = personaFromProfile({
      layer1_mode: null,
      niche_slug: undefined,
      gaya_key: 123,
      cerita_key: "bangun-suasana",
    });

    expect(persona).toEqual({ mode: "", niche: "", gaya: "", cerita: "bangun-suasana" });
    expect(isOnboardingComplete(persona)).toBe(false);
  });
});

describe("normalizeNextPath — tidak boleh memantulkan user kembali ke wizard", () => {
  test("path normal dipertahankan (query & hash ikut)", () => {
    expect(normalizeNextPath("/beranda")).toBe("/beranda");
    expect(normalizeNextPath("/konten/abc?tab=script")).toBe("/konten/abc?tab=script");
    expect(normalizeNextPath("/pengaturan#kredit")).toBe("/pengaturan#kredit");
  });

  test("loop ke /mulai dipaksa ke /beranda", () => {
    expect(normalizeNextPath("/mulai")).toBe(HOME_AFTER_ONBOARDING);
    expect(normalizeNextPath("/mulai?next=/beranda")).toBe(HOME_AFTER_ONBOARDING);
  });

  test("nilai berbahaya/kosong → /beranda", () => {
    expect(normalizeNextPath(null)).toBe(HOME_AFTER_ONBOARDING);
    expect(normalizeNextPath(undefined)).toBe(HOME_AFTER_ONBOARDING);
    expect(normalizeNextPath("")).toBe(HOME_AFTER_ONBOARDING);
    expect(normalizeNextPath("/")).toBe(HOME_AFTER_ONBOARDING);
    expect(normalizeNextPath("//evil.example/x")).toBe(HOME_AFTER_ONBOARDING);
    expect(normalizeNextPath("https://evil.example")).toBe(HOME_AFTER_ONBOARDING);
  });
});

describe("navigateTo — jalan keluar keras dari wizard", () => {
  test("memakai location.assign (bukan soft navigation yang bisa tertelan cache)", () => {
    const assign = vi.fn();

    navigateTo("/beranda?next=/mulai", { assign });

    expect(assign).toHaveBeenCalledWith("/beranda?next=/mulai");
  });

  test("tujuan yang memantul ke /mulai dinormalkan ke /beranda", () => {
    const assign = vi.fn();

    navigateTo("/mulai?next=/beranda", { assign });

    expect(assign).toHaveBeenCalledWith(HOME_AFTER_ONBOARDING);
  });

  test("fallback ke href bila assign tidak ada; tanpa target → tidak throw", () => {
    const target: { href?: string; assign?: undefined } = {};

    expect(() => navigateTo("/beranda", target)).not.toThrow();
    expect(target.href).toBe("/beranda");
    expect(() => navigateTo("/beranda", null)).not.toThrow();
  });
});

});
