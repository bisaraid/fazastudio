// ============================================================
// 5A — Invalidasi hilir (fungsi murni).
//
// MASALAH: `runAutoChain` kini resume-aware (melewati step yang sudah selesai).
// Kalau regenerasi step hulu tidak membatalkan hasil hilir, sticky bar bisa
// menampilkan "Download Video" untuk video yang dibuat dari script/audio LAMA.
//
// ATURAN:
//   - script  baru sukses → audio, subtitle, video pending & hasil dikosongkan
//   - audio   diregenerasi → subtitle + video direset (subtitle dibuat ulang
//                            otomatis oleh alur audio)
//   - subtitle diregenerasi → video direset (video memakai subtitleUrl)
// ============================================================

import type { PipelineStep, Project } from "@/lib/types";

/** Step hulu yang bisa memicu invalidasi. */
export type UpstreamStep = "script" | "audio" | "subtitle";

/** Jenis media yang punya kolom sendiri di tabel `projects`. */
export type MediaKind = "audio" | "subtitle" | "video";

/** Media hilir yang harus dibuang untuk setiap step hulu. */
export const DOWNSTREAM_MEDIA: Record<UpstreamStep, readonly MediaKind[]> = {
  script: ["audio", "subtitle", "video"],
  audio: ["subtitle", "video"],
  subtitle: ["video"],
};

/** Kolom media yang perlu dikosongkan lewat PATCH /api/projects. */
export function clearedMedia(upstream: UpstreamStep): MediaKind[] {
  return [...DOWNSTREAM_MEDIA[upstream]];
}

/**
 * Kembalikan salinan project dengan hasil hilir dibuang (atomik dengan
 * penyimpanan hasil hulu — pemanggil sudah memasang hasil hulu lebih dulu).
 *
 * Efek:
 *  - `steps[media]` → "pending"
 *  - media hilir → undefined (audio/subtitle/video)
 *  - `metadata.subtitleSrt` dibuang bila subtitle ikut direset
 *  - video hilang ⇒ status kembali "draft" (bukan "completed") dan
 *    videoStoragePlan/videoExpiresAt dibersihkan
 *  - `currentStep` kembali ke step hulu (subtitle bukan destination step ⇒ "video")
 */
export function invalidateDownstream(project: Project, upstream: UpstreamStep): Project {
  const drop = DOWNSTREAM_MEDIA[upstream];

  const steps = { ...project.steps };
  for (const media of drop) {
    steps[media as PipelineStep] = "pending";
  }

  const metadata = { ...(project.metadata || {}) };
  if (drop.includes("subtitle")) delete metadata.subtitleSrt;
  // Materi posting (caption/judul/hashtag) lahir dari script LAMA → tidak
  // valid lagi setelah script diregenerasi. Kolom metadata ikut ter-persist
  // lewat persistInvalidation (payload `metadata`).
  if (upstream === "script") delete metadata.posting;

  const next: Project = {
    ...project,
    steps,
    metadata,
    currentStep: (upstream === "subtitle" ? "video" : upstream) as PipelineStep,
    updatedAt: new Date().toISOString(),
  };

  for (const media of drop) {
    if (media === "audio") next.audio = undefined;
    if (media === "subtitle") next.subtitle = undefined;
    if (media === "video") {
      next.video = undefined;
      next.videoStoragePlan = undefined;
      next.videoExpiresAt = null;
      next.status = "draft";
    }
  }

  return next;
}
