/**
 * Setup global Vitest — penjelasan lengkap + bukti ada di TESTING.md
 * (bagian "vi.mock & Windows drive letter").
 *
 * Masalah: pada Windows, kunci registry mock `VitestMocker` bisa tidak
 * konsisten karena dua jalur resolve memakai case drive letter yang berbeda:
 *
 *   1. Registrasi `vi.mock` → `resolvePath` → `normalizeRequestId` → dilipat ke
 *      case drive `process.cwd()` (di mesin ini huruf kecil, mis. `c:/…`).
 *   2. Impor dengan specifier bentuk URL-root (`/src/…`, hasil ssrTransform) →
 *      `toFilePath` (pathe) → selalu huruf besar (`C:/…`).
 *
 * Akibatnya `registry.get()` MISS dan kode asli tetap dieksekusi (vi.mock
 * "tidak aktif" untuk file project).
 *
 * Fix: SEMUA kunci melewati `VitestMocker.normalizePath` sebelum masuk/keluar
 * registry — jadi kita menormalkan kunci DI titik tunggal itu (ke huruf besar,
 * mengikuti konvensi vite: "Vite always resolves drive letters to the upper
 * case", lihat komentar di node_modules/vite-node/dist/utils.mjs).
 *
 * Patch ini no-op di non-Windows (tidak ada prefix drive letter) dan aman
 * dijalankan berulang (guard `__winDriveCaseFixed`).
 */

type VitestMockerLike = {
  normalizePath: (id: string) => string;
  __winDriveCaseFixed?: boolean;
};

const mocker = (globalThis as { __vitest_mocker__?: VitestMockerLike })
  .__vitest_mocker__;

if (
  mocker &&
  typeof mocker.normalizePath === "function" &&
  !mocker.__winDriveCaseFixed
) {
  const originalNormalizePath = mocker.normalizePath.bind(mocker);
  mocker.normalizePath = (id: string) =>
    originalNormalizePath(id).replace(/^[a-z]:/, (drive) => drive.toUpperCase());
  mocker.__winDriveCaseFixed = true;
}