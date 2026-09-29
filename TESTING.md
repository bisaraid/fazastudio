# TESTING.md — Cara Menjalankan & Catatan Harness Vitest

## Menjalankan

```bash
npx vitest run                    # seluruh test sekali jalan
npx vitest run src/lib/__tests__/admin-chart.test.ts
npx vitest watch                  # mode watch
npx tsc --noEmit                  # type-check (selalu jalankan sebelum commit)
```

## Prinsip yang dipakai di repo ini

Test ditulis terhadap **fungsi murni** (pure function) — logika perhitungan,
parsing, format, dan aturan bisnis dipisah ke helper yang tidak menyentuh
jaringan/DOM. Contoh: `src/lib/admin-chart.ts`, `src/lib/admin-delta.ts`,
`src/lib/admin-activity.ts`, `src/lib/relative-time.ts`, `src/lib/admin-auth.ts`.

Bagian I/O (pemanggilan Supabase, `fetch`) sengaja dibuat setipis mungkin dan
tidak diuji langsung, supaya perilaku penting tetap punya coverage nyata.

## Status `vi.mock`: BERFUNGSI (sejak vitest 3.2.7 + `vitest.setup.ts`)

Status per 2026-09-30 (vitest 3.2.7 + vite 5.4.21 + Node 22.21, Windows):

- `vi.mock()` untuk **file di dalam project** (`@/lib/...`, `./helper`) →
  **berfungsi** berkat patch di `vitest.setup.ts` (lihat bawah).
- `vi.mock()` untuk **paket node_modules** (mis. `clsx`) → berfungsi (sejak dulu).
- Bukti nyata: `src/lib/__tests__/persona-resolve.test.ts` memakai
  `vi.mock("@/lib/supabase/service")` dan LULUS (cabang exact-match DB).

### Sejarah: dulu TIDAK berfungsi (vitest 2.1.9, diselidiki 2026-09-29)

Pada vitest 2.1.9, `vi.mock` untuk file project **tidak mencegat modul**: factory
tidak pernah dipanggil dan kode asli tetap dieksekusi (mock node_modules tetap
jalan). Upgrade ke vitest 3 tidak otomatis memperbaiki — akar masalahnya
bukan versi, melainkan **case drive letter Windows** (di bawah).

### Akar masalah (diinvestigasi 2026-09-30, terbukti via instrumentasi)

Di Windows, kunci registry mock `VitestMocker` bisa tidak konsisten karena dua
jalur resolve memakai case drive letter berbeda:

1. **Registrasi** `vi.mock("./x", f)` → `VitestMocker.resolvePath` →
   `normalizeRequestId` (vite-node) melipat id ke case drive `process.cwd()`.
   Di mesin ini cwd = `c:\APP\...` (huruf kecil) → kunci registrasi `c:/…`.
   (Bukti log: `resolvePath ./tmp-helper → {id: "c:/APP/.../tmp-helper.ts"}`.)
2. **Impor** dengan specifier bentuk URL-root (`/src/…`, hasil ssrTransform) →
   `_resolveUrl` → `toFilePath` (memakai `pathe`) → selalu huruf **besar** →
   fsPath `C:/…`.
   (Bukti log: `resolveUrl("/src/…") → ["…", "C:/APP/.../tmp-helper.ts"]`.)
3. `registry.get("C:/…")` terhadap kunci `"c:/…"` → **MISS** → modul asli
   dieksekusi. Komentar di `vite-node/dist/utils.mjs` sendiri menyebut:
   *"Vite always resolves drive letters to the upper case (realpathSync)"* —
   jadi konvensi vitest = huruf besar, sedangkan cwd kita huruf kecil.

Catatan: `process.chdir()` TIDAK bisa mengubah case drive (diverifikasi: cwd
tetap `c:\…` setelah chdir ke `C:\…`), jadi solusinya bukan mengubah cwd.

### Solusi: `vitest.setup.ts`

Semua kunci mock melewati `VitestMocker.normalizePath` sebelum masuk/keluar
registry (registrasi **dan** lookup). Setup file menormalkan kunci DI titik
tunggal itu — ke huruf besar, mengikuti konvensi vite. Efeknya id registrasi
dan id impor selalu sama, apapun case cwd. No-op di non-Windows.

### Cara memverifikasi sendiri (copy-paste)

```ts
// src/lib/__tests__/probe-mock.test.ts
import { test, expect, vi } from "vitest";

vi.mock("@/lib/admin-cache", () => ({
  adminCachedFetch: async () => ({ mocked: true }),
  adminInvalidate: () => {},
}));

test("mock file project", async () => {
  const { adminCachedFetch } = await import("@/lib/admin-cache");
  const r = (await adminCachedFetch("k", "https://contoh.test/x")) as { mocked?: boolean };
  expect(r.mocked).toBe(true); // HARUS LULUS (aktif sejak patch vitest.setup.ts)
});
```

Bentuk specifier yang sudah diverifikasi berfungsi: relatif (`./helper`),
alias (`@/lib/...`), dan node_modules.

## Catatan test yang pernah menyesatkan

`src/lib/__tests__/persona.test.ts` dulu memakai `vi.mock` yang tidak aktif,
sehingga test-nya lolos karena `resolvePersona` gagal membuat service client
(env Supabase kosong di test) lalu mengembalikan `null` — bukan karena
"kombinasi tidak ada di DB". Test tersebut sudah diperbaiki agar menyatakan
kontrak itu secara eksplisit, dan cabang exact-match DB kini diuji sungguhan
di `persona-resolve.test.ts` dengan mock yang benar-benar aktif.
