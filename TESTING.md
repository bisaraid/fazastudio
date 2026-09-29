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

## Keterbatasan penting: `vi.mock` TIDAK berfungsi untuk file project

Status per 2026-09-29 (vitest 2.1.9 + vite 5.4.21 + Node 22.21, Windows):

- `vi.mock()` untuk **file di dalam project** (`@/lib/...`, `./helper`, `.ts`
  maupun `.js`) **tidak mencegat modul**. Factory mock tidak pernah dipanggil
  dan kode asli tetap dieksekusi.
- `vi.mock()` untuk **paket node_modules** (mis. `clsx`) **berfungsi normal**.
- `vi.doMock()` + `import()` dinamis juga tidak berfungsi untuk file project.
- Menambah `test.server.deps.inline`, mengganti alias, atau memakai root huruf
  kecil (dugaan beda case drive Windows) tidak mengubah hasil.

### Bukti (hasil investigasi)

1. Transform Vitest **sudah benar**: import statis yang di-mock ditulis ulang
   menjadi dynamic import dan `vi.mock(...)` di-hoist ke atas, contoh keluaran
   dari pipeline transform:
   ```js
   const __vite_ssr_import_0__ = await __vite_ssr_import__("vitest", {...});
   __vite_ssr_import_0__.vi.mock("./tmp-helper", () => ({ hello: () => "mock" }));
   const __vi_import_0__ = await __vite_ssr_dynamic_import__("/src/lib/__tests__/tmp-helper.ts")
   ```
2. Namun saat runtime registry mock (`globalThis.__vitest_mocker__`) tidak
   menemukan id yang cocok, sehingga modul asli dimuat.
3. Karena itu kegagalan ada di tahap *interception/lookup* milik runner, bukan
   di kode test atau konfigurasi `vitest.config.ts` (dibuktikan juga dengan
   config minimal: hasilnya sama).

### Cara memverifikasi sendiri (copy-paste)

```ts
// src/lib/__tests__/probe-mock.test.ts
import { test, expect, vi } from "vitest";
import { adminCachedFetch } from "@/lib/admin-cache";

vi.mock("@/lib/admin-cache", () => ({
  adminCachedFetch: async () => ({ mocked: true }),
  adminInvalidate: () => {},
}));

test("mock file project", async () => {
  const r = (await adminCachedFetch("k", "https://contoh.test/x")) as { mocked?: boolean };
  expect(r.mocked).toBe(true); // GAGAL selama keterbatasan ini belum diperbaiki
});
```

## Rencana perbaikan (belum dieksekusi — butuh persetujuan)

Perbaikan yang paling mungkin berhasil adalah **menaikkan Vitest** (versi 2.x
sudah cukup lama dan tidak lagi menerima perbaikan):

```bash
npm i -D vitest@^3 @vitest/coverage-v8@^3
npx vitest run          # jalankan probe di atas; harus LULUS setelah upgrade
```

Risiko: perubahan lockfile; perlu menjalankan seluruh suite untuk memastikan
tidak ada perilaku yang berubah. Alternatif tanpa upgrade: terus pakai pola
fungsi murni + *dependency injection* untuk modul yang perlu diuji bercabang.

## Catatan test yang pernah menyesatkan

`src/lib/__tests__/persona.test.ts` dulu memakai `vi.mock` yang tidak aktif,
sehingga test-nya lolos karena `resolvePersona` gagal membuat service client
(env Supabase kosong di test) lalu mengembalikan `null` — bukan karena
"kombinasi tidak ada di DB". Test tersebut sudah diperbaiki agar menyatakan
kontrak itu secara eksplisit.
