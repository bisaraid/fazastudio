/**
 * Closing Engagement Strategies — Kategori Misteri (ACS)
 *
 * Sprint 3 awal: definisi lokal di file ini.
 * Sprint 4: dipindah ke closing-strategies.ts (terpusat untuk semua kategori).
 * File ini tetap ada sebagai re-export agar kode yang mengimport dari sini
 * (misal script-generator.ts) tidak rusak.
 */

export type { ClosingStrategy } from "./closing-strategies";
export { getClosingStrategy } from "./closing-strategies";
export { closingStrategiesByCategory } from "./closing-strategies";

// Re-export strategi misteri saja untuk kompatibilitas sprint 3
import { closingStrategiesByCategory } from "./closing-strategies";
export const closingStrategies = closingStrategiesByCategory["misteri"] || [];