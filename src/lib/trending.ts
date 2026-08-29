/**
 * Trending Topics — ACS (DB real, tanpa static palsu)
 *
 * 1. `getTrendingSuggestions()` — query tabel `trending_suggestions`
 *    (diisi cron Viraloop). Return [] jika DB kosong/gagal — TIDAK
 *    menginject data palsu.
 * 2. Menambahkan `source` = "db" | "empty" untuk debug di route.
 */

import { createServiceRoleClient } from "@/lib/supabase/service";

// ============================================================
// KOMPATIBILITAS FRONTEND EXISTING
// ============================================================

/**
 * Fungsi sinkron untuk kompatibilitas dengan UI existing (new-project/page.tsx).
 * Mengembalikan array KOSONG — TIDAK inject static palsu.
 * Data real diambil via getTrendingSuggestions() (async) di API route.
 */
export function getTrendingTopics(genre: string, limit = 5): string[] {
  return [];
}

// ============================================================
// TIPE TRENDING SUGGESTION
// ============================================================

export interface TrendingSuggestion {
  id: string;
  categoryId: string | null;
  title: string; // suggestion_text
  score: number; // proksi dari timestamp generated_at (tidak ada kolom score di DB)
  created_at: string; // generated_at
}

// ============================================================
// QUERY DB REAL
// ============================================================

export interface TrendingResult {
  ideas: string[];
  source: "db" | "empty";
}

/**
 * Normalisasi slug kategori ACS → slug DB ViraLoop.
 * Satu-satunya perbedaan: UI ACS memakai "horor" (ejaan Indonesia),
 * sedangkan DB ViraLoop memakai "horror". Sisanya identik.
 */
function normalizeCategorySlug(slug: string): string {
  return slug === "horor" ? "horror" : slug;
}

/**
 * Ambil trending suggestions dari tabel `trending_suggestions` (DB).
 * Jika query gagal ATAU result kosong → return [] (tanpa fallback palsu).
 *
 * @param categoryId - Slug kategori (opsional). Jika kosong, ambil semua.
 * @param limit - Maksimum items (default 10)
 * @returns { ideas, source }
 */
export async function getTrendingSuggestions(
  categoryId?: string,
  limit: number = 10
): Promise<TrendingResult> {
  try {
    const supabase = createServiceRoleClient();
    const query = supabase
      .from("trending_suggestions")
      .select("id, category_id, suggestion_text, generated_at")
      .order("generated_at", { ascending: false })
      .limit(limit);

    // Filter by category jika diberikan — cari UUID dari slug dulu.
    // ⚠️ Normalisasi slug ACS → slug DB: "horor" (UI ACS) ↔ "horror" (DB ViraLoop).
    if (categoryId) {
      const dbSlug = normalizeCategorySlug(categoryId);
      const { data: catData, error: catError } = await supabase
        .from("content_categories")
        .select("id")
        .eq("slug", dbSlug)
        .single();

      if (!catError && catData) {
        query.eq("category_id", catData.id);
      } else {
        // Slug tidak ditemukan atau error → return kosong, jangan palsukan
        return { ideas: [], source: "empty" };
      }
    }

    const { data, error } = await query;

    if (error) {
      console.warn("[Trending] Query DB gagal:", error.message);
      return { ideas: [], source: "empty" };
    }

    const mapped: TrendingSuggestion[] = (data || []).map((s: any) => ({
      id: s.id,
      categoryId: s.category_id,
      title: s.suggestion_text,
      score: s.generated_at ? new Date(s.generated_at).getTime() : 0,
      created_at: s.generated_at,
    }));

    if (mapped.length === 0) {
      // DB kosong → kosong, jangan palsukan
      return { ideas: [], source: "empty" };
    }

    return { ideas: mapped.map((s) => s.title).filter(Boolean), source: "db" };
  } catch (error) {
    console.warn("[Trending] Error query DB:", error);
    return { ideas: [], source: "empty" };
  }
}

/**
 * Fetch trending topics dari API route /api/trending-ideas (client-side).
 * Return [] jika gagal/kosong — tidak throw.
 *
 * @param category - Slug kategori (mis. "horror", "edukasi")
 * @returns Array of suggestion strings
 */
export async function fetchTrendingTopics(category: string): Promise<string[]> {
  try {
    const res = await fetch(`/api/trending-ideas?category=${encodeURIComponent(category)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.ideas ?? [];
  } catch {
    return [];
  }
}

export type TopicSource = "trending" | "ai" | "manual" | "empty";

export interface TopicSuggestResult {
  ideas: string[];
  source: TopicSource;
}

/**
 * Ambil topik saran untuk UI "Pilih Trending":
 * 1. Coba data trending dari DB (/api/trending-ideas).
 * 2. Jika kosong/gagal → fallback ke Saran AI (/api/suggest-ideas, on-demand).
 * 3. Kembalikan juga `source` agar UI bisa menampilkan keterangan "Saran AI".
 */
export async function fetchTopicSuggestions(category: string): Promise<TopicSuggestResult> {
  // 1. Trending DB
  try {
    const res = await fetch(`/api/trending-ideas?category=${encodeURIComponent(category)}`);
    if (res.ok) {
      const data = await res.json();
      const ideas: string[] = Array.isArray(data.ideas) ? data.ideas : [];
      if (ideas.length > 0) return { ideas, source: "trending" };
    }
  } catch {
    // fallthrough ke AI
  }

  // 2) Fallback AI on-demand — TANPA mengubah isi; UI akan menandai asal AI.
  try {
    const aiRes = await fetch(`/api/suggest-ideas?category=${encodeURIComponent(category)}`);
    if (aiRes.ok) {
      const data = await aiRes.json();
      const ideas: string[] = Array.isArray(data.ideas) ? data.ideas : [];
      if (ideas.length > 0) return { ideas, source: "ai" };
    }
  } catch {
    // fallthrough ke empty
  }

  return { ideas: [], source: "empty" };
}
