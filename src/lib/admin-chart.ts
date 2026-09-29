/**
 * Helper chart pertumbuhan admin — semua fungsi MURNI (tanpa DOM/jaringan),
 * jadi bisa diuji langsung dan komponen SVG tinggal memakainya.
 *
 * Sumber data: tabel `admin_metrics_daily` (migration 026). Kolom `is_estimated`
 * menandai baris hasil backfill (nilai perkiraan) — di chart digambar putus-putus.
 */

export interface MetricsRow {
  date: string; // YYYY-MM-DD
  totalUsers: number;
  totalProjects: number;
  totalScripts?: number;
  totalTrends?: number;
  paidUsers?: number;
  isEstimated: boolean;
}

export interface XY {
  x: number;
  y: number;
}

const DAY_LABEL: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

/** Label sumbu X pendek, mis. "12 Jan". String tidak valid → dikembalikan apa adanya. */
export function formatDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("id-ID", { ...DAY_LABEL, timeZone: "UTC" });
}

/** Bersihkan + urutkan baris naik per tanggal. Baris tanpa tanggal valid dibuang. */
export function buildMetricsPoints(rows: MetricsRow[] | null | undefined): MetricsRow[] {
  const list = (rows ?? []).filter((r) => r && typeof r.date === "string" && r.date.length >= 8);
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Batas atas sumbu Y yang "bulat" (1/1.5/2/2.5/3/4/5/6/8/10 × 10^n).
 * Nilai 0/negatif/NaN → 1 supaya skala tidak pernah nol (hindari bagi nol).
 */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const frac = value / base;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const nice = steps.find((s) => frac <= s) ?? 10;
  return nice * base;
}

/** Nilai garis bantu (gridline) 0..max, `count` interval, tanpa nilai duplikat. */
export function ticksFor(max: number, count = 4): number[] {
  const n = Math.max(1, Math.trunc(count));
  const top = Number.isFinite(max) && max > 0 ? max : 1;
  const out: number[] = [];
  for (let i = 0; i <= n; i += 1) {
    const v = Math.round((top * i) / n);
    // Nilai kecil (mis. max=1) bisa menghasilkan duplikat → buang supaya
    // gridline & label sumbu Y tidak menumpuk.
    if (out.length === 0 || out[out.length - 1] !== v) out.push(v);
  }
  return out;
}

/** Path SVG "M x y L x y ..." dari titik yang sudah dipetakan ke koordinat pixel. */
export function linePath(points: XY[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

/** Indeks titik terdekat dari posisi pointer (untuk tooltip). -1 kalau kosong. */
export function nearestIndex(xs: number[], x: number): number {
  if (xs.length === 0) return -1;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < xs.length; i += 1) {
    const d = Math.abs(xs[i] - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * Pisahkan titik menjadi segmen solid (data asli) dan putus-putus (perkiraan).
 * Titik batas disalin ke kedua segmen supaya garis tidak terputus saat
 * berganti dari data asli ke perkiraan (atau sebaliknya).
 */
export function splitEstimatedSegments<T extends { isEstimated: boolean }>(
  points: T[]
): { solid: T[][]; estimated: T[][] } {
  const solid: T[][] = [];
  const estimated: T[][] = [];
  let current: T[] = [];
  let currentFlag: boolean | null = null;

  for (const p of points) {
    const flag = Boolean(p.isEstimated);
    if (currentFlag === null) {
      currentFlag = flag;
      current = [p];
      continue;
    }
    if (flag === currentFlag) {
      current.push(p);
      continue;
    }
    // Ganti jenis data: tutup segmen sekarang + titik ini di kedua sisi.
    const target = currentFlag ? estimated : solid;
    target.push([...current, p]);
    const next = flag ? estimated : solid;
    next.push([current[current.length - 1], p]);
    current = [p];
    currentFlag = flag;
  }
  if (current.length > 0 && currentFlag !== null) {
    (currentFlag ? estimated : solid).push(current);
  }
  return { solid, estimated };
}

/** Ambil beberapa indeks label sumbu X supaya tidak berdesakan (maks `max`). */
export function labelIndices(count: number, max = 4): number[] {
  if (count <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const out = new Set<number>();
  for (let i = 0; i < max; i += 1) {
    out.add(Math.round((i * (count - 1)) / (max - 1)));
  }
  return Array.from(out).sort((a, b) => a - b);
}
