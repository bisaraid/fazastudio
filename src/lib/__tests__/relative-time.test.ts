import { test, expect, describe } from "vitest";
import { timeAgo } from "@/lib/relative-time";

const NOW = new Date("2026-01-15T12:00:00.000Z").getTime();
const ago = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("timeAgo", () => {
  test("null/undefined/invalid -> '—'", () => {
    expect(timeAgo(null, NOW)).toBe("—");
    expect(timeAgo(undefined, NOW)).toBe("—");
    expect(timeAgo("bukan-tanggal", NOW)).toBe("—");
  });

  test("detik, menit, jam, hari", () => {
    expect(timeAgo(ago(30 * SEC), NOW)).toBe("30 detik lalu");
    expect(timeAgo(ago(90 * SEC), NOW)).toBe("1 menit lalu");
    expect(timeAgo(ago(3 * HOUR), NOW)).toBe("3 jam lalu");
    expect(timeAgo(ago(2 * DAY), NOW)).toBe("2 hari lalu");
  });

  test("lebih dari 30 hari -> bulan, lebih dari 12 bulan -> tahun", () => {
    expect(timeAgo(ago(45 * DAY), NOW)).toBe("1 bulan lalu");
    expect(timeAgo(ago(400 * DAY), NOW)).toBe("1 tahun lalu");
  });

  test("waktu di masa depan tidak menghasilkan angka negatif", () => {
    expect(timeAgo(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe("0 detik lalu");
  });

  test("deterministik untuk nowMs yang sama", () => {
    const iso = ago(5 * MIN);
    expect(timeAgo(iso, NOW)).toBe(timeAgo(iso, NOW));
  });
});