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

const isWindows = process.platform === "win32";
const mocker = (globalThis as { __vitest_mocker__?: VitestMockerLike })
  .__vitest_mocker__;

// ── Guard: JANGAN gagal diam-diam ─────────────────────────────────────────────
// Tanpa patch ini vi.mock tetap "jalan" tapi TIDAK aktif untuk file project di
// Windows (bug case drive letter — lihat TESTING.md). Jika API internal
// berubah/lenyap saat upgrade Vitest, hentikan dengan pesan yang jelas, jangan
// lanjut dengan mock yang mati senyap.
if (!mocker || typeof mocker.normalizePath !== "function") {
  if (isWindows) {
    throw new Error(
      "[vitest.setup.ts] API internal VitestMocker.normalizePath " +
        (mocker
          ? "hilang/berubah bentuk (globalThis.__vitest_mocker__ ada tapi bukan function)"
          : "tidak ditemukan (globalThis.__vitest_mocker__ tidak ada)") +
        ". Patch drive-letter Windows tidak bisa dipasang → vi.mock akan DIAM-DIAM " +
        "tidak aktif untuk file project. Kemungkinan API internal Vitest berubah setelah " +
        "upgrade — perbarui vitest.setup.ts (TESTING.md, bagian " +
        '"vi.mock & Windows drive letter").'
    );
  }
  // Non-Windows: patch memang no-op (tak ada prefix drive letter) → aman dilewati.
} else if (!mocker.__winDriveCaseFixed) {
  const originalNormalizePath = mocker.normalizePath.bind(mocker);
  mocker.normalizePath = (id: string) =>
    originalNormalizePath(id).replace(/^[a-z]:/, (drive) => drive.toUpperCase());
  mocker.__winDriveCaseFixed = true;

  // Probe pasca-patch: buktikan drive letter benar-benar dinormalkan.
  const probe = mocker.normalizePath("c:/__vitest_drive_probe__");
  if (!probe.startsWith("C:/__vitest_drive_probe__")) {
    throw new Error(
      `[vitest.setup.ts] Patch terpasang tetapi hasil normalizePath tak terduga: "${probe}" ` +
        '(diharapkan "C:/__vitest_drive_probe__"). API internal kemungkinan berubah — ' +
        "perbarui patch di vitest.setup.ts (TESTING.md)."
    );
  }
}