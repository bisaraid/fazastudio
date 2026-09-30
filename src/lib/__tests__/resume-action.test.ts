import { test, expect, describe } from "vitest";
import {
  pickResumeAction,
  planChainSteps,
  formatRetryAfter,
  CREDIT_EXHAUSTED_CODE,
  RATE_LIMITED_CODE,
  AUTH_REQUIRED_CODE,
  CHAIN_ORDER,
  type ResumeInput,
} from "@/lib/pipeline/resume-action";

function input(patch: Partial<ResumeInput> = {}): ResumeInput {
  return {
    isRunning: false,
    hasScript: true,
    hasAudio: false,
    hasSubtitle: false,
    hasVideo: false,
    errorStep: null,
    errorCode: null,
    videoJobActive: false,
    ...patch,
  };
}

describe("pickResumeAction — alur normal", () => {
  test("belum ada script → Buat Script", () => {
    expect(pickResumeAction(input({ hasScript: false }))).toEqual({
      kind: "script",
      label: "Buat Script",
    });
  });

  test("script gagal → Coba Lagi (kind script)", () => {
    const a = pickResumeAction(input({ hasScript: false, errorStep: "script" }));
    expect(a.kind).toBe("script");
    expect(a.label).toBe("Coba Lagi");
  });

  test("script selesai, audio belum → rantai 'Buat Audio & Video'", () => {
    expect(pickResumeAction(input())).toMatchObject({
      kind: "chain",
      label: "Buat Audio & Video",
    });
  });

  test("audio selesai, subtitle belum → Buat Ulang Subtitle", () => {
    expect(pickResumeAction(input({ hasAudio: true }))).toMatchObject({
      kind: "subtitle",
      label: "Buat Ulang Subtitle",
    });
  });

  test("audio + subtitle selesai, video belum → Buat Video", () => {
    expect(
      pickResumeAction(input({ hasAudio: true, hasSubtitle: true }))
    ).toMatchObject({ kind: "video", label: "Buat Video" });
  });

  test("semua selesai → Download Video", () => {
    expect(
      pickResumeAction(input({ hasAudio: true, hasSubtitle: true, hasVideo: true }))
    ).toMatchObject({ kind: "download", label: "Download Video" });
  });

  test("sedang berjalan → tidak ada aksi", () => {
    expect(pickResumeAction(input({ isRunning: true })).kind).toBe("none");
  });
});

describe("pickResumeAction — lanjut dari errorStep (tanpa mengulang step done)", () => {
  test("audio gagal (script sudah ada) → kind chain (mulai dari audio)", () => {
    expect(pickResumeAction(input({ errorStep: "audio" }))).toMatchObject({
      kind: "chain",
      label: "Coba Lagi",
    });
  });

  test("regenerate script gagal padahal script lama masih ada → retry script saja", () => {
    const a = pickResumeAction(input({ hasScript: true, errorStep: "script" }));
    expect(a.kind).toBe("script");
    expect(a.label).toBe("Coba Lagi");
  });

  test("video gagal & tidak ada job hidup → Coba Lagi (kind video)", () => {
    const a = pickResumeAction(
      input({ hasAudio: true, hasSubtitle: true, errorStep: "video" })
    );
    expect(a.kind).toBe("video");
    expect(a.label).toBe("Coba Lagi");
  });

  test("video gagal tapi job masih hidup (reused) → Sambungkan ke Render + hint", () => {
    const a = pickResumeAction(
      input({
        hasAudio: true,
        hasSubtitle: true,
        errorStep: "video",
        videoJobActive: true,
      })
    );
    expect(a.kind).toBe("video");
    expect(a.label).toBe("Sambungkan ke Render");
    expect(a.hint).toContain("tanpa render ulang");
  });

  test("subtitle gagal (errorStep null, subtitle belum ada) → Buat Ulang Subtitle", () => {
    expect(
      pickResumeAction(input({ hasAudio: true, hasSubtitle: false, errorStep: null }))
    ).toMatchObject({ kind: "subtitle" });
  });
});

describe("pickResumeAction — 402 kredit habis", () => {
  test("errorCode CREDIT_EXHAUSTED → upgrade, bukan Coba Lagi", () => {
    const a = pickResumeAction(input({ errorCode: CREDIT_EXHAUSTED_CODE }));
    expect(a.kind).toBe("upgrade");
    expect(a.label).toContain("Upgrade");
  });

  test("402 menang atas errorStep audio (jangan ulangi request yang pasti gagal)", () => {
    expect(
      pickResumeAction(input({ errorStep: "audio", errorCode: CREDIT_EXHAUSTED_CODE })).kind
    ).toBe("upgrade");
  });

  test("402 saat video → tetap upgrade", () => {
    expect(
      pickResumeAction(
        input({
          hasAudio: true,
          hasSubtitle: true,
          errorStep: "video",
          errorCode: CREDIT_EXHAUSTED_CODE,
        })
      ).kind
    ).toBe("upgrade");
  });
});

describe("pickResumeAction — 429 rate limit (5B)", () => {
  test("errorCode RATE_LIMITED → kind limited + hint waktu tunggu", () => {
    const a = pickResumeAction(
      input({ errorCode: RATE_LIMITED_CODE, retryAfterSeconds: 900 })
    );
    expect(a.kind).toBe("limited");
    expect(a.label).toContain("Batas harian");
    expect(a.hint).toBe("Coba lagi dalam 15 menit.");
  });

  test("429 menang atas errorStep audio (retry hanya memperpanjang lockout)", () => {
    expect(
      pickResumeAction(input({ errorStep: "audio", errorCode: RATE_LIMITED_CODE })).kind
    ).toBe("limited");
  });

  test("tanpa Retry-After → hint generik, bukan 'NaN menit'", () => {
    const a = pickResumeAction(input({ errorCode: RATE_LIMITED_CODE }));
    expect(a.hint).toBe("Coba lagi nanti atau besok.");
  });
});

describe("formatRetryAfter", () => {
  test("< 1 jam → menit dibulatkan ke atas", () => {
    expect(formatRetryAfter(900)).toBe("Coba lagi dalam 15 menit.");
    expect(formatRetryAfter(59)).toBe("Coba lagi dalam 1 menit.");
    expect(formatRetryAfter(1)).toBe("Coba lagi dalam 1 menit.");
  });

  test("≥ 1 jam → jam; ≥ 1 hari → besok", () => {
    expect(formatRetryAfter(3600)).toBe("Coba lagi dalam 1 jam.");
    expect(formatRetryAfter(7200)).toBe("Coba lagi dalam 2 jam.");
    expect(formatRetryAfter(86_400)).toBe("Coba lagi besok.");
    expect(formatRetryAfter(90_000)).toBe("Coba lagi besok.");
  });

  test("nilai tidak valid → default aman", () => {
    const bad = [null, undefined, 0, -5, NaN, Infinity];
    for (const v of bad) {
      expect(formatRetryAfter(v as number | null)).toBe("Coba lagi nanti atau besok.");
    }
  });
});

describe("pickResumeAction — 401 AUTH_REQUIRED (5D)", () => {
  test("→ kind auth (buka gate daftar), bukan error merah", () => {
    const a = pickResumeAction(input({ errorCode: AUTH_REQUIRED_CODE }));
    expect(a.kind).toBe("auth");
    expect(a.label).toContain("Daftar gratis");
  });

  test("401 menang atas errorStep video (endpoint mahal menolak anon)", () => {
    const a = pickResumeAction(
      input({
        hasAudio: true,
        hasSubtitle: true,
        errorStep: "video",
        errorCode: AUTH_REQUIRED_CODE,
      })
    );
    expect(a.kind).toBe("auth");
  });
});

describe("pickResumeAction — setelah regenerasi media hilir di-reset (5A)", () => {
  test("regen script sukses → media hilir kosong → chain, BUKAN download", () => {
    const a = pickResumeAction(
      input({ hasScript: true, hasAudio: false, hasSubtitle: false, hasVideo: false })
    );
    expect(a.kind).toBe("chain");
    expect(a.kind).not.toBe("download");
  });

  test("regen audio → subtitle+video hilang → lanjut subtitle, BUKAN download", () => {
    const a = pickResumeAction(
      input({ hasScript: true, hasAudio: true, hasSubtitle: false, hasVideo: false })
    );
    expect(a.kind).toBe("subtitle");
    expect(a.kind).not.toBe("download");
  });

  test("regen subtitle → video hilang → kind video", () => {
    const a = pickResumeAction(
      input({ hasAudio: true, hasSubtitle: true, hasVideo: false })
    );
    expect(a.kind).toBe("video");
  });
});

describe("planChainSteps (5A — perencana rantai murni)", () => {
  const full = { hasScript: true, hasAudio: true, hasSubtitle: true, hasVideo: true };

  test("semua kosong → urutan penuh script → video", () => {
    expect(
      planChainSteps({ hasScript: false, hasAudio: false, hasSubtitle: false, hasVideo: false })
    ).toEqual(["script", "audio", "subtitle", "video"]);
  });

  test("semua selesai → tidak ada step ([])", () => {
    expect(planChainSteps(full)).toEqual([]);
  });

  test("setelah regen script → audio+subtitle+video muncul lagi (tidak dilewati)", () => {
    expect(planChainSteps({ ...full, hasAudio: false, hasSubtitle: false, hasVideo: false })).toEqual([
      "audio",
      "subtitle",
      "video",
    ]);
  });

  test("regen audio → subtitle & video dijalankan, audio TIDAK diulang", () => {
    expect(planChainSteps({ ...full, hasSubtitle: false, hasVideo: false })).toEqual([
      "subtitle",
      "video",
    ]);
  });

  test("regen subtitle → hanya video", () => {
    expect(planChainSteps({ ...full, hasVideo: false })).toEqual(["video"]);
  });

  test("urutan plan selalu mengikuti CHAIN_ORDER", () => {
    const plan = planChainSteps({
      hasScript: false,
      hasAudio: false,
      hasSubtitle: false,
      hasVideo: false,
    });
    expect([...plan]).toEqual([...CHAIN_ORDER]);
  });
});
