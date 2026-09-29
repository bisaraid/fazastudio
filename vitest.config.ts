import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Catatan harness (lihat TESTING.md untuk detail + bukti):
 * - `vitest.setup.ts` MEMPERBAIKI `vi.mock()` untuk file project (src/**) di
 *   Windows: kunci registry mock dinormalkan ke huruf besar agar cocok dengan
 *   jalur impor root-URL. Akar masalah = beda case drive letter antara
 *   `normalizeRequestId` (case cwd) dan `toFilePath`/pathe (huruf besar) —
 *   lengkap dengan rantai penyebabnya di TESTING.md.
 * - Tanpa patch itu, vi.mock hanya berfungsi untuk paket node_modules.
 * - Test ditulis terhadap fungsi murni bila memungkinkan; modul I/O dibuat
 *   setipis mungkin.
 */
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['node_modules', '.next', '**/.kilo/**', 'dist', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});