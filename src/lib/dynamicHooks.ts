/**
 * Dynamic Hooks — Ambil hook pattern yang TERBUKTI punya performa tinggi
 * dari data crawl (pattern_insights), bukan cuma hookAngles statis.
 *
 * Fungsi getTopHooks():
 * - Query pattern_insights untuk kategori tertentu
 * - Filter low_confidence != true
 * - Filter hanya pattern_key = 'hook_type'
 * - Sort by avg_view_count DESC
 * - Ambil top 3 pattern_value
 * - Return array of human-readable hook angle strings
 * - Fallback: return [] kalau data belum cukup (tidak throw error)
 *
 * Diadopsi dari viraloop/src/lib/dynamicHooks.ts (92 baris).
 *
 * Tabel sudah ada di Supabase project bersama (acs & viraloop pakai
 * project sama), berisi data real dari crawler viraloop di Vercel.
 * Fallback return [] tetap ada jika query gagal.
 */
import { createServerClient } from './supabase/server';

export interface TopHookResult {
  /** Human-readable hook angle text */
  angle: string;
  /** Raw pattern_value from DB */
  patternValue: string;
  /** Average view count for this pattern */
  avgViewCount: number;
}

// Map pattern_value ke format hook angle yang manusiawi
function formatHookAngle(value: string, avgViewCount: number): string {
  const count = avgViewCount.toLocaleString();
  switch (value) {
    case 'pertanyaan':
      return `[${count} views] Hook berupa pertanyaan yang langsung bikin penasaran — pola terbukti dari data`;
    case 'angka':
      return `[${count} views] Hook diawali angka — pola terbukti menarik perhatian dari data`;
    case 'clickbait_kata':
      return `[${count} views] Hook pakai kata pemicu emosi/FOMO — pola terbukti dari data`;
    case 'netral':
      return `[${count} views] Hook gaya netral/deskriptif — pola yang juga terbukti dari data`;
    default:
      return `[${count} views] Hook gaya "${value}" — pola terbukti dari data`;
  }
}

/**
 * Ambil top hook_type patterns yang terbukti performa tinggi dari data crawl.
 *
 * @param categorySlug - Slug kategori (contoh: 'horror', 'psychology', dll)
 * @returns Array of hook angle strings (max 3). Kosong jika data belum cukup.
 */
export async function getTopHooks(categorySlug: string): Promise<TopHookResult[]> {
  const supabase = createServerClient();

  // 1. Cari UUID kategori dari slug
  const { data: category, error: catError } = await supabase
    .from('content_categories')
    .select('id')
    .eq('slug', categorySlug)
    .single();

  if (catError || !category) {
    // Kategori belum ada di DB — fallback graceful
    console.warn(`[dynamicHooks] Category slug "${categorySlug}" not found in DB`);
    return [];
  }

  // 2. Ambil top hook_type patterns dengan high confidence
  const { data: insights, error: insError } = await supabase
    .from('pattern_insights')
    .select('pattern_value, avg_view_count')
    .eq('category_id', category.id)
    .eq('pattern_key', 'hook_type')
    .eq('low_confidence', false)
    .order('avg_view_count', { ascending: false })
    .limit(3);

  if (insError) {
    console.error(`[dynamicHooks] Error query pattern_insights for ${categorySlug}:`, insError.message);
    return [];
  }

  if (!insights || insights.length === 0) {
    // Data crawl belum cukup — fallback
    return [];
  }

  // 3. Map ke format yang bisa dipakai prompt generator
  const results: TopHookResult[] = insights.map(ins => ({
    angle: formatHookAngle(ins.pattern_value, Number(ins.avg_view_count)),
    patternValue: ins.pattern_value,
    avgViewCount: Number(ins.avg_view_count),
  }));

  return results;
}