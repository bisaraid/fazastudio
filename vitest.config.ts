import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Catatan harness (lihat TESTING.md untuk detail + bukti):
 * - `vi.mock()` untuk file di dalam project (src/**) TIDAK mencegat modul di
 *   setup ini (vitest 2.1.9 + vite 5.4.21 + Node 22, Windows). Mock untuk paket
 *   node_modules tetap berfungsi.
 * - Karena itu test ditulis terhadap fungsi murni; modul I/O dibuat setipis mungkin.
 * - Perbaikan yang disarankan: naikkan vitest ke versi 3.x (butuh persetujuan,
 *   mengubah lockfile), lalu jalankan probe di TESTING.md.
 */
export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['node_modules', '.next', '**/.kilo/**', 'dist', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});