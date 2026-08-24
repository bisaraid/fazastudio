import { test, expect, describe, vi, beforeEach } from "vitest";

// ============================================================
// MOCK Supabase service client — builder chain yang akurat
// ============================================================

let mockLimitResult: { data: any; error: any } = { data: [], error: null };
let mockSingleResult: { data: any; error: any } = { data: { id: "cat-1" }, error: null };

// Builder yang bisa di-await (thenable) DAN punya .eq() untuk query.eq()
function createThenableBuilder(result: { data: any; error: any }) {
  const builder: any = {
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(async () => mockSingleResult),
    then: (resolve: any) => resolve(result),
  };
  return builder;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => createThenableBuilder(mockLimitResult)),
    })),
  }),
}));

import { getTrendingSuggestions, getTrendingTopics } from "@/lib/trending";

describe("getTrendingSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimitResult = { data: [], error: null };
    mockSingleResult = { data: { id: "cat-1" }, error: null };
  });

  test("DB return data → array terisi", async () => {
    mockLimitResult = {
      data: [
        { id: "1", category_id: "cat-1", suggestion_text: "Topik A", generated_at: "2026-01-01" },
        { id: "2", category_id: "cat-1", suggestion_text: "Topik B", generated_at: "2026-01-02" },
      ],
      error: null,
    };

    const result = await getTrendingSuggestions("horor");
    expect(result.ideas).toEqual(["Topik A", "Topik B"]);
    expect(result.source).toBe("db");
  });

  test("DB error → array kosong, tidak throw", async () => {
    mockLimitResult = { data: null, error: { message: "DB down" } };

    const result = await getTrendingSuggestions("horor");
    expect(result.ideas).toEqual([]);
    expect(result.source).toBe("empty");
  });

  test("DB return [] → array kosong", async () => {
    mockLimitResult = { data: [], error: null };

    const result = await getTrendingSuggestions("horor");
    expect(result.ideas).toEqual([]);
    expect(result.source).toBe("empty");
  });

  test("slug tidak ditemukan → array kosong", async () => {
    mockSingleResult = { data: null, error: { message: "not found" } };

    const result = await getTrendingSuggestions("custom-niche");
    expect(result.ideas).toEqual([]);
    expect(result.source).toBe("empty");
  });

  test("getTrendingTopics return [] (tidak ada static palsu)", () => {
    expect(getTrendingTopics("horor")).toEqual([]);
    expect(getTrendingTopics("misteri")).toEqual([]);
  });
});