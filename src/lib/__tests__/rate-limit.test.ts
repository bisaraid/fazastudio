import { test, expect, describe, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, getClientIp, pruneFallbackStore, getFallbackStoreSize, clearFallbackStore } from "@/lib/rate-limit";

const MINUTE=60_000;
const DAY=24*60*60_000;

describe("checkRateLimit - fallback in-memory",()=>{
  beforeEach(()=>{ vi.useFakeTimers(); });
  afterEach(()=>{ clearFallbackStore(); vi.useRealTimers(); });

  test("izinkan hingga maxRequests dalam window",async()=>{
    for(let i=0;i<5;i++){
      await checkRateLimit("k:1", 5, MINUTE);
    }
    const r1=await checkRateLimit("k:1", 5, MINUTE);
    expect(r1.remaining).toBe(0);
  });

  test("request ke-(maxRequests+1) ditolak",async()=>{
    for(let i=0;i<5;i++){
      await checkRateLimit("k:2", 5, MINUTE);
    }
    const denied=await checkRateLimit("k:2", 5, MINUTE);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.resetInSeconds).toBeGreaterThan(0);
  });

  test("sliding window: request yang lewat window tidak dihitung lagi",async()=>{
    await checkRateLimit("k:3", 2, MINUTE);
    await checkRateLimit("k:3", 2, MINUTE);
    const blocked=await checkRateLimit("k:3", 2, MINUTE);
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(61_000);
    const ok=await checkRateLimit("k:3", 2, MINUTE);
    expect(ok.allowed).toBe(true);
  });

  test("REGRESSION: key window 24 jam TIDAK diprune oleh window 60s",async()=>{
    await checkRateLimit("anon:trial", 2, DAY);
    await checkRateLimit("anon:trial", 2, DAY);
    const blocked=await checkRateLimit("anon:trial", 2, DAY);
    expect(blocked.allowed).toBe(false);

    await checkRateLimit("k:lain", 99, MINUTE);

    vi.advanceTimersByTime(61_000);
    const after=await checkRateLimit("anon:trial", 2, DAY);
    expect(after.allowed).toBe(false);
  });

  test("pruneFallbackStore menghapus key yang sudah lewat window",async()=>{
    await checkRateLimit("p:1", 1, MINUTE);
    await checkRateLimit("p:2", 1, MINUTE);
    await checkRateLimit("p:3", 1, MINUTE);
    expect(getFallbackStoreSize()).toBe(3);

    vi.advanceTimersByTime(61_000);
    const remaining=pruneFallbackStore();
    expect(remaining).toBe(0);
    expect(getFallbackStoreSize()).toBe(0);
  });

  test("key dipakai ulang dengan window berbeda",async()=>{
    await checkRateLimit("k:5", 1, MINUTE);
    const blocked=await checkRateLimit("k:5", 1, MINUTE);
    expect(blocked.allowed).toBe(false);

    const fresh=await checkRateLimit("k:5", 1, 5_000);
    expect(fresh.allowed).toBe(true);
  });

  test("getClientIp membaca header",()=>{
    const req={ headers: { get: (k: string)=> (k==="x-forwarded-for" ? "203.0.113.9,10.0.0.1" : null) } };
    expect(getClientIp(req as any)).toBe("203.0.113.9");
  });
});
