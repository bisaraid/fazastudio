import { test, expect, vi, beforeEach } from "vitest";
import { resolvePersona } from "@/lib/persona";

// ============================================================================
// Test cabang EXACT-MATCH DB resolvePersona.
//
// Test ini memakai vi.mock("@/lib/supabase/service") — hanya mungkin sejak
// harness vi.mock diperbaiki (vitest 3.2.7 + vitest.setup.ts, lihat TESTING.md).
// Sebelumnya mock ini tidak aktif dan test lolos karena jalur ERROR, bukan
// karena "kombinasi tidak ada di DB".
// ============================================================================

interface RecordedQuery {
  table: string;
  filters: Record<string, unknown>;
}

/** Data mock: key `mode|niche|gaya|cerita` → prompt. */
const db = new Map<string, string>();
/** Semua query yang sampai ke "DB" — untuk memastikan filter exact-match. */
const queries: RecordedQuery[] = [];

beforeEach(() => {
  db.clear();
  queries.length = 0;
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      };
      chain.maybeSingle = async () => {
        queries.push({ table, filters });
        const key = `${filters.mode}|${filters.niche_slug}|${filters.gaya_key}|${filters.cerita_key}`;
        const prompt = db.get(key);
        return { data: prompt ? { prompt } : null, error: null };
      };
      return chain;
    },
  }),
}));

test("resolvePersona: kombinasi ada di DB -> prompt + matchedKey, filter exact 4 layer", async () => {
  db.set("jualan|mistis|pendongeng-pelan|bangun-suasana", "PROMPT_MISTIS");

  const result = await resolvePersona({
    mode: "jualan",
    nicheSlug: "mistis",
    gayaKey: "pendongeng-pelan",
    ceritaKey: "bangun-suasana",
  });

  expect(result).toEqual({
    prompt: "PROMPT_MISTIS",
    matchedKey: "jualan|mistis|pendongeng-pelan|bangun-suasana",
  });

  // Query harus tepat ke persona_prompts dengan 4 filter exact-match.
  expect(queries).toHaveLength(1);
  expect(queries[0].table).toBe("persona_prompts");
  expect(queries[0].filters).toEqual({
    mode: "jualan",
    niche_slug: "mistis",
    gaya_key: "pendongeng-pelan",
    cerita_key: "bangun-suasana",
  });
});

test("resolvePersona: kombinasi TIDAK ada di DB -> null (bukan jalur error)", async () => {
  // Tidak ada baris di db → maybeSingle mengembalikan { data: null, error: null }
  // persis seperti Supabase saat kombinasi tak ditemukan.
  const result = await resolvePersona({
    mode: "konten",
    nicheSlug: "masak",
    gayaKey: "gaya-x",
    ceritaKey: "cerita-y",
  });

  expect(result).toBeNull();
  // Query tetap terkirim (artinya ini "tidak ketemu", bukan "client gagal").
  expect(queries).toHaveLength(1);
});