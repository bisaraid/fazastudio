// ============================================================
// REL-06 — Guard job ganda render video (fungsi murni).
//
// Fakta (Langkah 0):
//   - /api/generate-video TIDAK punya dedupe: setiap request = 1 job baru
//     (`jobId = render:<projectId>:<Date.now()>`).
//   - Tidak ada endpoint cancel job (worker di luar src/) ⇒ job lama yang
//     masih jalan TIDAK bisa dibatalkan dari web app.
//   - Kuota harian video dihitung per REQUEST (bukan per sukses) ⇒ job kedua
//     untuk project yang sama = kuota + CPU dobel.
//
// Karena itu strategi yang aman & tanpa migrasi: pakai ulang job yang MASIH
// hidup untuk project + media (audio/subtitle) yang sama, alih-alih
// menembak job kedua. Jendela `REUSE_WINDOW_MS` disamakan dengan timeout
// total watchdog klien supaya job lama/zombie tidak dipakai selamanya.
// ============================================================

/** Selaras dengan TOTAL_TIMEOUT_MS watchdog klien (15 menit). */
export const REUSE_WINDOW_MS = 15 * 60_000;

/** Ringkasan job BullMQ yang masih hidup (state active/waiting/delayed). */
export interface CandidateJob {
  id: string;
  /** ms epoch pembuatan job (BullMQ `job.timestamp`). */
  timestamp?: number;
  projectId?: string;
  audioUrl?: string;
  subtitleUrl?: string;
}

export interface ReuseRequest {
  projectId: string;
  audioUrl: string;
  subtitleUrl: string;
  /** Waktu sekarang (ms) — disuntikkan agar fungsi murni & mudah diuji. */
  nowMs: number;
}

/**
 * true bila `job` masih bisa dipakai ulang untuk request ini:
 * project sama + media sama + dibuat dalam jendela reuse.
 */
export function isReusableRenderJob(job: CandidateJob, req: ReuseRequest): boolean {
  if (!job || !job.id) return false;
  if (job.projectId !== req.projectId) return false;
  if (job.audioUrl !== req.audioUrl) return false;
  if (job.subtitleUrl !== req.subtitleUrl) return false;
  const created = job.timestamp;
  if (typeof created !== "number" || !Number.isFinite(created)) return false;
  return req.nowMs - created <= REUSE_WINDOW_MS;
}

/** jobId pertama yang layak dipakai ulang, atau null bila tidak ada. */
export function pickReusableRenderJob(
  jobs: readonly CandidateJob[],
  req: ReuseRequest
): string | null {
  for (const job of jobs) {
    if (isReusableRenderJob(job, req)) return job.id;
  }
  return null;
}
