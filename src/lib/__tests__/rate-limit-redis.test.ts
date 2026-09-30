import { test, expect, describe, vi, beforeEach } from "vitest";

// ============================================================
// 5B — jalur REDIS dari checkRateLimit (tanpa server Redis).
//
// ioredis diganti fake sorted-set in-memory. Yang dijaga:
//   1. request yang diizinkan TETAP tercatat (ZADD dipertahankan),
//   2. request yang DITOLAK DIHAPUS kembali (ZREM) → retry berulang tidak
//      memperpanjang lockout dan tidak menumbuhkan memori Redis,
//   3. resetInSeconds stabil saat ditolak berulang.
// ============================================================

const shared = vi.hoisted(() => ({
  sets: new Map<string, Map<string, number>>(),
}));

vi.hoisted(() => {
  process.env.REDIS_URL = "redis://fake:6379";
});

vi.mock("ioredis", () => {
  function getSet(key: string) {
    let s = shared.sets.get(key);
    if (!s) {
      s = new Map<string, number>();
      shared.sets.set(key, s);
    }
    return s;
  }

  class FakePipeline {
    private ops: Array<() => unknown> = [];
    zadd(key: string, score: number, member: string) {
      this.ops.push(() => {
        getSet(key).set(member, score);
        return 1;
      });
      return this;
    }
    zremrangebyscore(key: string, min: number, max: number) {
      this.ops.push(() => {
        const s = getSet(key);
        let removed = 0;
        for (const [member, score] of Array.from(s.entries())) {
          if (score >= min && score <= max) {
            s.delete(member);
            removed += 1;
          }
        }
        return removed;
      });
      return this;
    }
    zcard(key: string) {
      this.ops.push(() => getSet(key).size);
      return this;
    }
    expire() {
      this.ops.push(() => 1);
      return this;
    }
    async exec() {
      return this.ops.map((fn) => [null, fn()] as [null, unknown]);
    }
  }

  class FakeRedis {
    pipeline() {
      return new FakePipeline();
    }
    async zrem(key: string, member: string) {
      return getSet(key).delete(member) ? 1 : 0;
    }
    async zrange(key: string, start: number, stop: number, withScores?: string) {
      const sorted = Array.from(getSet(key).entries()).sort((a, b) => a[1] - b[1]);
      const slice = sorted.slice(start, stop + 1);
      if (withScores === "WITHSCORES") {
        return slice.flatMap(([member, score]) => [member, String(score)]);
      }
      return slice.map(([member]) => member);
    }
    // Dipakai ioredis asli; fake tidak butuh koneksi nyata.
    async connect() {}
    on() {}
  }

  return { default: FakeRedis };
});

import { checkRateLimit } from "@/lib/rate-limit";

const KEY = "acs-ratelimit:rl:uji";

describe("checkRateLimit — jalur Redis (5B: ZADD-on-deny)", () => {
  beforeEach(() => {
    shared.sets.clear();
  });

  test("request yang DIIZINKAN tercatat di sorted set", async () => {
    const r = await checkRateLimit("rl:ok", 3, 60_000);
    expect(r.allowed).toBe(true);
    expect(shared.sets.get("acs-ratelimit:rl:ok")?.size).toBe(1);
  });

  test("request ke-(max+1) DITOLAK dan member-nya TIDAK ikut tersimpan", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit("rl:deny", 3, 60_000)).allowed).toBe(true);
    }
    const denied = await checkRateLimit("rl:deny", 3, 60_000);

    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    // Sebelum fix: 4 member (request ditolak ikut tercatat). Sesudah: tetap 3.
    expect(shared.sets.get("acs-ratelimit:rl:deny")?.size).toBe(3);
  });

  test("retry berulang saat ditolak tidak memperpanjang lockout", async () => {
    await checkRateLimit("rl:retry", 1, 60_000);
    const first = await checkRateLimit("rl:retry", 1, 60_000);
    expect(first.allowed).toBe(false);

    for (let i = 0; i < 20; i++) {
      await checkRateLimit("rl:retry", 1, 60_000);
    }
    const last = await checkRateLimit("rl:retry", 1, 60_000);

    // Window tetap dihitung dari satu-satunya request yang sah.
    expect(shared.sets.get("acs-ratelimit:rl:retry")?.size).toBe(1);
    expect(Math.abs(last.resetInSeconds - first.resetInSeconds)).toBeLessThanOrEqual(1);
  });

  test("setelah window lewat, request berikutnya diizinkan lagi", async () => {
    await checkRateLimit("rl:expire", 1, 1000);
    expect((await checkRateLimit("rl:expire", 1, 1000)).allowed).toBe(false);

    // Geser timestamp member lama ke belakang (di luar window).
    const set = shared.sets.get("acs-ratelimit:rl:expire")!;
    for (const [member, score] of Array.from(set.entries())) {
      set.set(member, score - 5000);
    }
    expect(shared.sets.get(KEY)).toBeUndefined(); // key uji lain tidak tersentuh
    expect((await checkRateLimit("rl:expire", 1, 1000)).allowed).toBe(true);
  });
});
