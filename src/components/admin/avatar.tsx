"use client";

/**
 * Kompat shim — implementasi Avatar pindah ke `@/components/layout/avatar`
 * (bersama untuk navbar app, landing, admin, dan /harga). File ini tetap
 * ada agar import lama & unit test `src/lib/__tests__/admin-avatar.test.ts`
 * tidak perlu diubah.
 */
export * from "@/components/layout/avatar";
export { default } from "@/components/layout/avatar";
