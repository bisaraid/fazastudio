/**
 * Usage History — Anti-repeat hook/angle per user.
 *
 * Sebelum memilih hook/angle untuk generate baru, module ini:
 * 1. Query beberapa entry usage_history terakhir milik identity_key yang sama
 * 2. Hindari memilih hook_pattern_value yang sudah pernah dipakai, selama masih ada opsi lain
 * 3. Jika semua opsi sudah habis: fallback ke random (tanpa error), cukup log peringatan
 * 4. Simpan record baru ke usage_history setiap generate berhasil
 *
 * identity_key masih placeholder (belum integrasi cookie penuh — Task 4).
 *
 * Diadopsi dari viraloop/src/lib/usage-history.ts (143 baris).
 *
 * Tabel sudah ada di Supabase project bersama (acs & viraloop pakai
 * project sama), berisi data real dari crawler viraloop di Vercel.
 * Fallback return [] / log warning tetap ada jika query gagal.
 */
import { createServiceRoleClient } from '@/lib/supabase/service';

export interface UsageHistoryRecord {
  id: string;
  identity_key: string;
  category_id: string;
  hook_pattern_value_used: string | null;
  topic: string | null;
  created_at: string;
}

/**
 * Ambil N entry usage_history terakhir milik identity_key + category_id.
 * Default ambil 10 record terakhir.
 */
export async function getRecentUsage(
  identityKey: string,
  categoryId: string,
  limit: number = 10
): Promise<UsageHistoryRecord[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('usage_history')
    .select('*')
    .eq('identity_key', identityKey)
    .eq('category_id', categoryId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[usage-history] Error querying recent usage:', error.message);
    return [];
  }

  return (data ?? []) as UsageHistoryRecord[];
}

/**
 * Ambil himpunan hook_pattern_value yang sudah pernah dipakai oleh
 * identity_key di category tertentu (N record terakhir).
 *
 * Return: Set<string> dari patternValue yang sudah dipakai.
 */
export async function getUsedHookPatternValues(
  identityKey: string,
  categoryId: string,
  recentLimit: number = 10
): Promise<Set<string>> {
  const records = await getRecentUsage(identityKey, categoryId, recentLimit);
  const used = new Set<string>();

  for (const record of records) {
    if (record.hook_pattern_value_used) {
      used.add(record.hook_pattern_value_used);
    }
  }

  return used;
}

/**
 * Filter daftar HookEntry, singkirkan patternValue yang sudah pernah dipakai.
 *
 * @param entries - Daftar HookEntry yang tersedia (static + dynamic)
 * @param usedPatternValues - Set patternValue yang sudah dipakai
 * @returns HookEntry yang belum pernah dipakai
 */
export function filterUnusedEntries<T extends { patternValue: string }>(
  entries: T[],
  usedPatternValues: Set<string>
): T[] {
  return entries.filter(entry => !usedPatternValues.has(entry.patternValue));
}

/**
 * Pilih hook entry secara random, dengan prioritas menghindari yang sudah dipakai.
 *
 * Strategi:
 * 1. Filter unused entries
 * 2. Jika masih ada unused: pilih random dari unused
 * 3. Jika semua sudah dipakai (unused habis): log warning, fallback random dari semua entries
 *
 * @returns Selected entry (dijamin selalu ada, tidak null — selama entries tidak kosong)
 */
export function selectHookWithAntiRepeat<T extends { patternValue: string }>(
  entries: T[],
  usedPatternValues: Set<string>
): T {
  if (entries.length === 0) {
    throw new Error('[usage-history] entries kosong — tidak bisa memilih hook');
  }

  const unused = filterUnusedEntries(entries, usedPatternValues);

  if (unused.length > 0) {
    // Masih ada opsi yang belum dipakai — pilih random dari unused
    return unused[Math.floor(Math.random() * unused.length)];
  }

  // Semua opsi sudah pernah dipakai — fallback ke random dari semua entries
  console.warn(
    `[usage-history] Semua hook pattern_value sudah pernah dipakai (${usedPatternValues.size} unique used). Fallback ke random dari ${entries.length} entries.`
  );
  return entries[Math.floor(Math.random() * entries.length)];
}

/**
 * Simpan record baru ke usage_history setelah generate berhasil.
 *
 * identity_key adalah placeholder (belum integrasi cookie).
 * Kegagalan insert tidak throw error — hanya log warning.
 */
export async function recordUsage(
  identityKey: string,
  categoryId: string,
  hookPatternValueUsed: string | null,
  topic: string | null
): Promise<void> {
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from('usage_history').insert({
    identity_key: identityKey,
    category_id: categoryId,
    hook_pattern_value_used: hookPatternValueUsed,
    topic,
  });

  if (error) {
    console.warn('[usage-history] Gagal menyimpan record usage:', error.message);
  }
}