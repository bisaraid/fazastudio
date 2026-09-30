// ============================================================
// REL-01 — Keputusan watchdog progres render video (fungsi murni).
//
// Fakta dari worker (`worker/src/index.ts`, `worker/src/render.ts`):
//   - Pesan yang di-publish hanya `{ status: "processing" }`, `{ percent }`,
//     `{ status: "done" }`, `{ status: "error" }` (tidak ada "uploading").
//     Selama job masih mengantre di BullMQ tidak ada pesan apa pun.
//   - `{ percent }` hanya dikirim saat FFmpeg jalan; sebelumnya (unduh asset,
//     siapkan font/subtitle) dan sesudahnya (baca file + upload ke storage)
//     stream memang senyap → fase itu harus pakai ambang panjang.
//   - Tidak ada endpoint status job terpisah (hanya SSE /api/video-progress),
//     sehingga pemulihan dilakukan dengan reconnect sekali.
//   - SSE proxy mengirim komentar `: ping` tiap 15 dtk, TAPI komentar tidak
//     memicu `onmessage` di browser → watchdog hanya bisa memakai pesan nyata
//     sebagai tanda hidup.
// ============================================================

/** Tanpa percent: masih mengantre / masih menyiapkan asset (senyap itu normal). */
export const STALL_WHILE_QUEUED_MS = 120_000;

/** Percent mengalir (0..99) → FFmpeg jalan & mengirim progress tiap baris log. */
export const STALL_DURING_RENDER_MS = 30_000;

/** Percent 100 → menunggu upload ke storage sebelum `done` (senyap lagi). */
export const STALL_WHILE_UPLOADING_MS = 120_000;

/** Keputusan watchdog pada satu siklus pemeriksaan. */
export type WatchdogDecision = "wait" | "recover" | "reject";

export interface WatchdogInput {
  /** Percent terakhir dari SSE, atau `null` bila belum pernah menerima percent. */
  lastPercent: number | null;
  /** Pemulihan (reconnect) sudah dipakai sekali. */
  recoveryUsed: boolean;
  /** Sudah berapa lama tidak ada pesan SSE (ms). */
  idleMs: number;
}

/**
 * Ambang diam sesuai fase:
 *  - `null`  → antre di BullMQ / unduh asset & siapkan subtitle (bisa >30 dtk)
 *  - `0..99` → FFmpeg sedang jalan; progress datang hampir terus-menerus
 *  - `100`   → upload final ke storage sebelum `done`
 */
export function stallTimeoutMs(lastPercent: number | null): number {
  if (lastPercent === null) return STALL_WHILE_QUEUED_MS;
  if (lastPercent >= 100) return STALL_WHILE_UPLOADING_MS;
  return STALL_DURING_RENDER_MS;
}

/**
 * `wait`    → masih wajar, teruskan menunggu
 * `recover` → diam terlalu lama & pemulihan belum dipakai → reconnect sekali
 * `reject`  → diam terlalu lama setelah pemulihan → gagalkan dengan pesan jelas
 */
export function decideWatchdog(input: WatchdogInput): WatchdogDecision {
  const { lastPercent, recoveryUsed, idleMs } = input;
  if (idleMs < stallTimeoutMs(lastPercent)) return "wait";
  if (!recoveryUsed) return "recover";
  return "reject";
}
