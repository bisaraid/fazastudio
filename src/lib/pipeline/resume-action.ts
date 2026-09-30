// ============================================================
// Fase 4B (D11) — Pemilih aksi lanjutan (fungsi murni, tanpa React).
//
// Dipakai sticky bar untuk memutuskan SATU aksi berikutnya, termasuk
// melanjutkan dari `errorStep` tanpa mengulang step yang sudah selesai
// (mencegah TTS/render ganda).
// ============================================================

import type { PipelineStep } from "@/lib/types";

export type ResumeKind =
  | "none" // sedang berjalan → tidak ada aksi
  | "script" // belum ada script
  | "chain" // audio → subtitle → video (resume-aware di usePipeline)
  | "subtitle" // subtitle gagal → ulangi subtitle (video menyusul via chain)
  | "video" // audio+subtitle siap → render video
  | "download" // semua selesai
  | "upgrade" // kredit habis (402)
  | "limited" // 429: batas harian / rate limit — tombol disabled
  | "auth"; // 401: endpoint mahal menolak anon → buka gate daftar

export interface ResumeAction {
  kind: ResumeKind;
  label: string;
  hint?: string;
}

export interface ResumeInput {
  isRunning: boolean;
  hasScript: boolean;
  hasAudio: boolean;
  /** Subtitle sudah selesai dibuat (dependency internal audio → video). */
  hasSubtitle: boolean;
  hasVideo: boolean;
  /** Step destination yang gagal (dari progress.errorStep). */
  errorStep: PipelineStep | null;
  /** Kode error dari API (mis. "CREDIT_EXHAUSTED" untuk 402). */
  errorCode: string | null;
  /** Sisa detik dari header Retry-After (bila API mengirimnya). */
  retryAfterSeconds?: number | null;
  /** Server memakai ulang job render yang masih hidup (jobId sama, tanpa render baru). */
  videoJobActive: boolean;
}

/** Kode error yang dipakai klien saat API membalas 402 (kredit habis). */
export const CREDIT_EXHAUSTED_CODE = "CREDIT_EXHAUSTED";

/** Kode error saat API membalas 429 (limit harian / rate limit). */
export const RATE_LIMITED_CODE = "RATE_LIMITED";

/** Kode error saat endpoint mahal menolak anon (401) — buka gate daftar. */
export const AUTH_REQUIRED_CODE = "AUTH_REQUIRED";

/** Tujuan tombol upgrade saat kredit habis. */
export const UPGRADE_HREF = "/harga";

/**
 * 5B: teks waktu tunggu dari header Retry-After (detik).
 * Contoh: 900 → "Coba lagi dalam 15 menit."; 7200 → "…2 jam."; 90000 → "besok".
 */
export function formatRetryAfter(seconds?: number | null): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return "Coba lagi nanti atau besok.";
  }
  if (seconds < 3600) {
    return `Coba lagi dalam ${Math.max(1, Math.ceil(seconds / 60))} menit.`;
  }
  if (seconds < 86_400) {
    return `Coba lagi dalam ${Math.max(1, Math.ceil(seconds / 3600))} jam.`;
  }
  return "Coba lagi besok.";
}

// ============================================================
// 5A — Perencana rantai (dipakai runAutoChain supaya keputusan "step mana yang
// masih perlu dijalankan" bisa diuji tanpa React).
// ============================================================
export const CHAIN_ORDER: readonly PipelineStep[] = ["script", "audio", "subtitle", "video"] as const;

export interface ChainPlanInput {
  hasScript: boolean;
  hasAudio: boolean;
  hasSubtitle: boolean;
  hasVideo: boolean;
}

/**
 * Daftar step yang MASIH harus dijalankan, berurutan.
 * Step yang sudah selesai (atau baru saja di-invalidasi hilir oleh 5A) tidak
 * akan muncul di sini — dan sebaliknya, step yang baru direset WAJIB muncul.
 */
export function planChainSteps(input: ChainPlanInput): PipelineStep[] {
  const plan: PipelineStep[] = [];
  if (!input.hasScript) plan.push("script");
  if (!input.hasAudio) plan.push("audio");
  if (!input.hasSubtitle) plan.push("subtitle");
  if (!input.hasVideo) plan.push("video");
  return plan;
}

/**
 * Satu-satunya sumber kebenaran aksi utama. Prioritas:
 *   running → 402 → script → errorStep → progres normal → upload/download.
 */
export function pickResumeAction(input: ResumeInput): ResumeAction {
  const {
    isRunning,
    hasScript,
    hasAudio,
    hasSubtitle,
    hasVideo,
    errorStep,
    errorCode,
    videoJobActive,
  } = input;

  if (isRunning) return { kind: "none", label: "" };

  // Kredit habis: "Coba Lagi" pasti gagal lagi → tawarkan upgrade.
  if (errorCode === CREDIT_EXHAUSTED_CODE) {
    return {
      kind: "upgrade",
      label: "Kredit habis — Upgrade",
      hint: "Kredit bulan ini sudah terpakai.",
    };
  }

  // 429 (batas harian / rate limit): tombol utama DISABLED + waktu tunggu,
  // bukan "Coba Lagi" yang hanya memperpanjang lockout.
  if (errorCode === RATE_LIMITED_CODE) {
    return {
      kind: "limited",
      label: "Batas harian tercapai, coba lagi nanti",
      hint: formatRetryAfter(input.retryAfterSeconds),
    };
  }

  // 401 dari endpoint mahal (anon) → arahkan ke gate daftar, bukan error merah.
  if (errorCode === AUTH_REQUIRED_CODE) {
    return { kind: "auth", label: "Daftar gratis untuk melanjutkan" };
  }

  if (!hasScript) {
    return { kind: "script", label: errorStep === "script" ? "Coba Lagi" : "Buat Script" };
  }

  // Script lama masih ada tapi regenerate-nya gagal → tetap retry script saja
  // (jangan lompat ke audio/video yang belum bisa jalan).
  if (errorStep === "script") return { kind: "script", label: "Coba Lagi" };

  // Gagal di tengah rantai → lanjutkan dari step yang gagal (step lain di-skip).
  if (errorStep === "audio") return { kind: "chain", label: "Coba Lagi" };
  if (errorStep === "video") {
    return videoJobActive
      ? {
          kind: "video",
          label: "Sambungkan ke Render",
          hint: "Render masih berjalan di server — tanpa render ulang.",
        }
      : { kind: "video", label: "Coba Lagi" };
  }

  if (!hasAudio) return { kind: "chain", label: "Buat Audio & Video" };
  if (!hasSubtitle) return { kind: "subtitle", label: "Buat Ulang Subtitle" };
  if (!hasVideo) return { kind: "video", label: "Buat Video" };

  return { kind: "download", label: "Download Video" };
}
