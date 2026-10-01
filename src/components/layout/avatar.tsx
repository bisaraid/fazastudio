"use client";

/**
 * Avatar akun — komponen bersama untuk semua permukaan yang menampilkan
 * identitas user: navbar app (`layout/navbar.tsx`), landing (`app/page.tsx`),
 * admin (`components/admin/topbar.tsx`), dan `/harga`.
 *
 * Kontrak tampilan identitas (dipakai konsisten di semua navbar):
 *   `Avatar size="sm" md?` + `displayNameOf` (nama) + `user.email` (email,
 *   fallback "Tanpa email") — inisial hanya bila tidak ada gambar.
 *
 * - Kalau `src` berisi URL gambar yang valid → tampilkan gambar.
 * - Kalau tidak ada / gagal dimuat → tampilkan inisial.
 * - Warna latar dihitung deterministik dari email/nama, jadi user yang sama
 *   selalu mendapat warna yang sama tanpa perlu state atau query DB.
 *
 * Tidak ada request jaringan tambahan: sumber gambar hanya dari user_metadata
 * Supabase yang sudah tersedia di client (lihat `avatarSourceFromUser`).
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
const PALETTE = [
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
] as const;

const SIZES = {
  xs: "h-7 w-7 text-[11px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
} as const;

export type AvatarSize = keyof typeof SIZES;

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  size?: AvatarSize;
  className?: string;
}
/** Hanya terima URL http(s)/data-image asli — cegah gambar pecah dari metadata. */
export function isValidAvatarUrl(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return /^(https?:\/\/|data:image\/)/i.test(v);
}

/** Inisial: dari nama (maks 2 huruf), fallback huruf pertama email, fallback "?". */
export function initialsOf(name?: string | null, email?: string | null): string {
  const n = (name ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const e = (email ?? "").trim();
  return e ? e.charAt(0).toUpperCase() : "?";
}

/** Warna deterministik dari seed. Selalu mengembalikan salah satu kelas PALETTE. */
export function paletteFor(seed: string): string {
  const s = seed || "akun";
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

/** Ambil URL avatar dari user Supabase tanpa request tambahan. */
export function avatarSourceFromUser(user: {
  user_metadata?: Record<string, unknown> | null;
} | null | undefined): string {
  const md = user?.user_metadata ?? {};
  const raw =
    (typeof md.avatar_url === "string" && md.avatar_url) ||
    (typeof md.picture === "string" && md.picture) ||
    "";
  return isValidAvatarUrl(raw) ? raw.trim() : "";
}

/**
 * Nama tampilan: full_name → name → bagian sebelum "@" dari email.
 * `fallback` opsional dipakai permukaan non-admin (mis. navbar app → "Akun");
 * default "Admin" dipertahankan agar unit test lama tetap hijau.
 */
export function displayNameOf(
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined,
  fallback: string = "Admin"
): string {
  const md = user?.user_metadata ?? {};
  const full = typeof md.full_name === "string" ? md.full_name : "";
  const name = typeof md.name === "string" ? md.name : "";
  const email = user?.email ?? "";
  return full.trim() || name.trim() || (email ? email.split("@")[0] : fallback);
}

export function Avatar({ src, name, email, size = "sm", className }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const url = isValidAvatarUrl(src) ? (src ?? "").trim() : "";
  const seed = (email ?? name ?? "").trim() || "akun";
  const label = (name ?? "").trim() || (email ?? "").trim() || "Akun";

  // Reset status gagal kalau sumber gambarnya berganti.
  useEffect(() => {
    setBroken(false);
  }, [url]);

  const showImg = Boolean(url) && !broken;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold",
        SIZES[size],
        showImg ? "bg-muted" : paletteFor(seed),
        className
      )}
      title={label}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initialsOf(name, email)}</span>
      )}
    </span>
  );
}

export default Avatar;