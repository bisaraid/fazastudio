/**
 * Waktu relatif berbahasa Indonesia (mis. "14 menit lalu").
 * Murni & bisa disuntik `nowMs` supaya bisa diuji tanpa memanipulasi jam.
 */

export function timeAgo(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";

  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (diffSec < 60) return `${diffSec} detik lalu`;

  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} menit lalu`;

  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} jam lalu`;

  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} hari lalu`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} bulan lalu`;

  return `${Math.floor(months / 12)} tahun lalu`;
}
