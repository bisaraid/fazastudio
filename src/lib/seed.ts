/**
 * Session Seed — variasi diksi per generate (pure, tanpa import DB/next).
 * Hanya runtime, TIDAK ditulis ke DB.
 */

const SEED_ADJECTIVES = [
  "tenang", "berani", "hangat", "misterius", "ceria", "tegas", "lembut",
  "reflektif", "semangat", "santai", "serius", "playful", "dramatis", "lugas",
  "intim", "energik", "kalem", "provokatif", "menghibur", "inspiratif",
];

const SEED_NOUNS = [
  "senja", "ombak", "angin", "hujan", "bintang", "gunung", "sungai", "kota",
  "hutan", "pantai", "awan", "api", "tanah", "langit", "jalan", "pohon",
  "batu", "pasir", "daun", "cahaya",
];

/**
 * Generate session seed — random adjective + noun pair (50+ kombinasi).
 */
export function generateSeed(): string {
  const adj = SEED_ADJECTIVES[Math.floor(Math.random() * SEED_ADJECTIVES.length)];
  const noun = SEED_NOUNS[Math.floor(Math.random() * SEED_NOUNS.length)];
  return `${adj}-${noun}`;
}