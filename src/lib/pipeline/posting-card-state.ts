// ============================================================
// Kartu "Siap untuk Posting" — logika show/hide (fungsi murni).
//
// Aturan:
//   - Kartu hanya tampil SETELAH video selesai (lazy) — pre-video "hidden".
//   - Caption dibaca dari cache project (metadata.posting); fallback ke
//     field script lama (optimizedTitle/caption/hashtag) untuk kompatibilitas.
//   - Tanpa cache → "loading" (auto-fetch, maks ~15 dtk); gagal/timeout →
//     "failed" (baris kecil + tombol "Buat caption"); ada isi → "content".
// ============================================================

import type { ProjectMetadata, ScriptResult } from "@/lib/types";

/** Materi posting siap pakai (judul optimasi + caption + hashtag). */
export type PostingMaterial = NonNullable<ProjectMetadata["posting"]>;

/** Status fetch caption di kartu. */
export type PostingFetchStatus = "idle" | "loading" | "error";

/** Fase render kartu. */
export type PostingCardPhase = "hidden" | "loading" | "content" | "failed";

/** true jika materi punya setidaknya satu konten non-kosong. */
export function hasPostingMaterial(material?: PostingMaterial | null): boolean {
  if (!material) return false;
  if (material.optimizedTitle?.trim()) return true;
  if (material.caption?.trim()) return true;
  return (material.hashtags ?? []).some(
    (h) => typeof h === "string" && h.trim() !== ""
  );
}

/**
 * Gabungkan cache project (metadata.posting) dengan fallback field script
 * lama — kompatibilitas project yang menyimpan materi di script sebelum
 * dipindah ke metadata. Null jika keduanya kosong.
 */
export function resolvePostingCache(
  posting?: ProjectMetadata["posting"] | null,
  script?: Pick<ScriptResult, "optimizedTitle" | "caption" | "hashtags"> | null
): PostingMaterial | null {
  if (hasPostingMaterial(posting)) return posting ?? null;
  if (script && hasPostingMaterial(script)) {
    return {
      optimizedTitle: script.optimizedTitle,
      caption: script.caption,
      hashtags: script.hashtags,
    };
  }
  return null;
}

/**
 * Fase render kartu — fungsi murni (diuji unit test):
 *  - pre-video           → "hidden"  (kartu tidak dirender sama sekali)
 *  - cache ada isi       → "content" (langsung tampil, tanpa fetch)
 *  - fetch gagal/timeout → "failed"  (baris kecil + tombol "Buat caption")
 *  - selain itu          → "loading" (skeleton saat auto-fetch berjalan)
 */
export function getPostingCardPhase(input: {
  videoDone: boolean;
  material: PostingMaterial | null;
  fetchStatus: PostingFetchStatus;
}): PostingCardPhase {
  if (!input.videoDone) return "hidden";
  if (hasPostingMaterial(input.material)) return "content";
  if (input.fetchStatus === "error") return "failed";
  return "loading";
}