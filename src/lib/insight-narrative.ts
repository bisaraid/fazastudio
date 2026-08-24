/**
 * insight-narrative.ts — Rule-based narrative generator for pattern insights.
 *
 * MURNI template/rule-based, TIDAK memanggil LLM apapun.
 * Mengubah angka mentah pattern_insights menjadi paragraf narasi
 * yang menjelaskan KENAPA suatu pattern performa tinggi/rendah.
 *
 * Diadopsi dari viraloop/src/lib/insight-narrative.ts (302 baris).
 * Tidak ada import — murni standalone.
 *
 * FUNGSI:
 * - generateInsightNarrative(): menghasilkan narasi insight per kategori
 * - generateAllNarratives(): generate narasi untuk banyak kategori sekaligus
 *
 * DI VIRALOOP dipanggil dari: app/api/admin/insights/route.ts
 */

export interface NarrativeInput {
  categoryName: string;
  baseline: number;
  patterns: Array<{
    pattern_key: string;
    pattern_value: string;
    avg_view_count: number | null;
    sample_count: number | null;
    low_confidence: boolean;
  }>;
}

export interface NarrativeOutput {
  narrative: string;
}

const patternKeyReadable: Record<string, string> = {
  hook_type: 'hook',
  duration_bucket: 'durasi',
  title_length_bucket: 'panjang judul',
};

function getPerformanceLabel(ratio: number): { label: string; adverb: string } {
  if (ratio >= 2.0) return { label: 'SANGAT KUAT', adverb: 'sangat kuat' };
  if (ratio >= 1.2) return { label: 'DI ATAS rata-rata', adverb: 'di atas rata-rata' };
  if (ratio >= 0.8) return { label: 'SETARA rata-rata', adverb: 'setara rata-rata, bukan pembeda kuat' };
  return { label: 'DI BAWAH rata-rata', adverb: 'di bawah rata-rata, sebaiknya dihindari' };
}

export function generateInsightNarrative(input: NarrativeInput): string {
  const { categoryName, baseline, patterns } = input;

  if (!patterns || patterns.length === 0) {
    return `Untuk kategori ${categoryName}, belum tersedia cukup data pattern untuk menghasilkan insight yang bermakna.`;
  }

  // Group by pattern_key
  const grouped: Record<string, NarrativeInput['patterns']> = {};
  for (const p of patterns) {
    if (!grouped[p.pattern_key]) grouped[p.pattern_key] = [];
    grouped[p.pattern_key].push(p);
  }

  const hookPatterns = grouped['hook_type'] || [];
  const durationPatterns = grouped['duration_bucket'] || [];
  const titlePatterns = grouped['title_length_bucket'] || [];

  const ratioOf = (p: NarrativeInput['patterns'][0]) => baseline > 0 ? (p.avg_view_count ?? 0) / baseline : 0;

  const bestHook = hookPatterns.reduce((best, p) => ratioOf(p) > ratioOf(best) ? p : best, hookPatterns[0]);
  const bestDuration = durationPatterns.reduce((best, p) => ratioOf(p) > ratioOf(best) ? p : best, durationPatterns[0]);
  const bestTitle = titlePatterns.reduce((best, p) => ratioOf(p) > ratioOf(best) ? p : best, titlePatterns[0]);
  const worstDuration = durationPatterns.reduce((worst, p) => ratioOf(p) < ratioOf(worst) ? p : worst, durationPatterns[0]);

  const parts: string[] = [`Untuk kategori ${categoryName},`];
  const strongKeys: string[] = [];
  if (bestHook && ratioOf(bestHook) >= 1.2) strongKeys.push('hook');
  if (bestDuration && ratioOf(bestDuration) >= 1.2) strongKeys.push('durasi');
  if (bestTitle && ratioOf(bestTitle) >= 1.2) strongKeys.push('panjang judul');

  if (strongKeys.length >= 2 && bestHook && bestDuration) {
    const hRatio = ratioOf(bestHook).toFixed(2);
    const dRatio = ratioOf(bestDuration).toFixed(2);
    let combo = `kombinasi paling efektif adalah hook berupa "${bestHook.pattern_value}" dengan durasi "${bestDuration.pattern_value}"`;
    combo += ` — kedua pattern ini sama-sama terbukti ${strongKeys.length === 2 ? 'di atas rata-rata' : 'sangat kuat'}`;
    combo += ` (hook: ${hRatio}x, durasi: ${dRatio}x lipat dari rata-rata)`;
    if (bestTitle && ratioOf(bestTitle) >= 1.2) {
      combo += `. Panjang judul "${bestTitle.pattern_value}" juga mendukung dengan performa di atas rata-rata`;
    }
    parts.push(combo);
  } else if (strongKeys.length >= 1 && bestHook) {
    const best = strongKeys.includes('hook') ? bestHook : strongKeys.includes('durasi') ? bestDuration : bestTitle;
    const keyLabel = patternKeyReadable[best.pattern_key] || best.pattern_key;
    const ratio = ratioOf(best).toFixed(2);
    const tier = ratioOf(best) >= 2.0 ? 'SANGAT KUAT' : 'DI ATAS rata-rata';
    parts.push(
      `pattern ${keyLabel} berupa "${best.pattern_value}" terbukti ${tier} — ` +
      `rata-rata ${(best.avg_view_count ?? 0).toLocaleString('id-ID')} views (${ratio}x lipat dari baseline` +
      (best.sample_count != null ? `, dari ${best.sample_count} sampel` : '') + ')'
    );
    if (bestDuration && bestDuration !== best && ratioOf(bestDuration) >= 1.2) {
      parts.push(`durasi "${bestDuration.pattern_value}" juga menunjukkan performa positif (${ratioOf(bestDuration).toFixed(2)}x)`);
    }
  } else {
    const all = [bestHook, bestDuration, bestTitle].filter(Boolean).sort((a, b) => ratioOf(b!) - ratioOf(a!));
    if (all.length > 0) {
      const bestOverall = all[0]!;
      const keyLabel = patternKeyReadable[bestOverall.pattern_key] || bestOverall.pattern_key;
      parts.push(
        `tidak ada pattern yang menonjol secara signifikan — pattern ${keyLabel} "${bestOverall.pattern_value}" ` +
        `paling mendekati rata-rata dengan rasio ${ratioOf(bestOverall).toFixed(2)}x`
      );
    } else {
      parts.push('belum tersedia cukup data pattern untuk memberikan rekomendasi yang berarti');
    }
  }

  const weakKeys: string[] = [];
  if (worstDuration && ratioOf(worstDuration) < 0.8) weakKeys.push('durasi');
  if (hookPatterns.length > 0 && hookPatterns.some(p => ratioOf(p) < 0.8)) weakKeys.push('hook');
  if (titlePatterns.length > 0 && titlePatterns.some(p => ratioOf(p) < 0.8)) weakKeys.push('panjang judul');

  if (weakKeys.length >= 1) {
    const weakParts: string[] = [];
    if (weakKeys.includes('durasi') && worstDuration) {
      weakParts.push(`durasi "${worstDuration.pattern_value}" yang performanya hanya ${ratioOf(worstDuration).toFixed(2)}x dari rata-rata`);
    }
    if (weakKeys.includes('hook')) {
      const worstHook = hookPatterns.reduce((worst, p) => ratioOf(p) < ratioOf(worst) ? p : worst, hookPatterns[0]);
      if (worstHook) weakParts.push(`hook "${worstHook.pattern_value}" yang hanya ${ratioOf(worstHook).toFixed(2)}x dari rata-rata`);
    }
    if (weakParts.length > 0) {
      parts.push(`Sebaliknya, hindari ${weakParts.join(', ')} — pattern ini terbukti kurang efektif untuk kategori ${categoryName}`);
    }
  }

  const lowConfPatterns = patterns.filter(p => p.low_confidence);
  if (lowConfPatterns.length >= 2) {
    parts.push(
      `Catatan: banyak pattern di atas masih bertumpu pada data terbatas ` +
      `(${lowConfPatterns.length} dari ${patterns.length} pattern memiliki sampel minim) — ` +
      `interpretasi ini perlu divalidasi ulang seiring bertambahnya data`
    );
  } else if (lowConfPatterns.length === 1) {
    const lcp = lowConfPatterns[0];
    parts.push(
      `Catatan: pattern ${patternKeyReadable[lcp.pattern_key] || lcp.pattern_key} ` +
      `"${lcp.pattern_value}" masih berdasarkan data terbatas (${lcp.sample_count ?? '?'} sampel) — ` +
      `perlu lebih banyak data sebelum bisa diandalkan penuh`
    );
  }

  return parts.join(' ') + '.';
}

export function generateAllNarratives(
  patternInsights: Array<{
    category_id: string;
    pattern_key: string;
    pattern_value: string;
    avg_view_count: number | null;
    sample_count: number | null;
    low_confidence: boolean;
  }>,
  baselines: Record<string, number>,
  categories: Array<{ id: string; name: string }>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const cat of categories) {
    const catPatterns = patternInsights.filter(p => p.category_id === cat.id);
    result[cat.id] = generateInsightNarrative({
      categoryName: cat.name,
      baseline: baselines[cat.id] || 0,
      patterns: catPatterns,
    });
  }
  return result;
}