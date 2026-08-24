/**
 * Mendapatkan emoji untuk kategori konten
 *
 * Diadopsi dari viraloop/src/lib/utils/category.ts (18 baris).
 * Tidak ada import — murni standalone.
 * Utility ini generic (berdasarkan string id) — cocok dipakai langsung
 * dengan struktur category acs (lib/categories/types.ts & index.ts).
 */
export function getCategoryEmoji(id: string): string {
  const map: Record<string, string> = {
    horror: '👻',
    psikologi: '🧠',
    romance: '💕',
    motivasi: '🔥',
    edukasi: '📚',
    affiliate: '🛍️',
    misteri: '🔍',
    sejarah: '🏛️',
    keuangan: '💰',
    custom: '✏️',
  };
  return map[id] || '📝';
}