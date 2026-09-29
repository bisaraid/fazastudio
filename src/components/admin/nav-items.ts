/**
 * Sumber tunggal navigasi admin.
 *
 * Dipakai oleh:
 *   - Sidebar        (grup + ikon)
 *   - Command palette ⌘K (label + kata kunci pencarian)
 *
 * Menambah halaman admin baru cukup di sini → sidebar & palette ikut terbarui.
 */

import type { LucideIcon } from "lucide-react";
import { BarChart2, CreditCard, TrendingUp, Users } from "lucide-react";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group: string;
  /** Kata kunci tambahan (sinonim istilah) supaya pencarian lebih cepat ketemu. */
  keywords: string[];
}

export interface AdminNavGroup {
  group: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    group: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/admin/overview",
        icon: BarChart2,
        group: "Overview",
        keywords: ["overview", "statistik", "stats", "ringkasan", "delta", "grafik", "beranda admin"],
      },
      {
        label: "Trending",
        href: "/admin/trending",
        icon: TrendingUp,
        group: "Overview",
        keywords: ["trend", "topik", "harvest", "rss", "youtube", "ide"],
      },
    ],
  },
  {
    group: "Manajemen",
    items: [
      {
        label: "Users",
        href: "/admin/users",
        icon: Users,
        group: "Manajemen",
        keywords: ["user", "pengguna", "akun", "email", "plan", "admin", "avatar"],
      },
      {
        label: "Transaksi",
        href: "/admin/transaksi",
        icon: CreditCard,
        group: "Manajemen",
        keywords: ["transaksi", "pembayaran", "midtrans", "billing", "invoice", "langganan", "plan"],
      },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);

/**
 * Cari halaman admin. Murni → mudah diuji.
 * Urutan hasil: label diawali query → label mengandung → kata kunci diawali →
 * kata kunci mengandung → href mengandung. Stabil (indeks asli sebagai tie-break).
 */
export function searchNavItems(
  query: string,
  items: AdminNavItem[] = ADMIN_NAV_ITEMS
): AdminNavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const scored: { item: AdminNavItem; score: number; idx: number }[] = [];
  items.forEach((item, idx) => {
    const label = item.label.toLowerCase();
    const href = item.href.toLowerCase();
    let score = -1;
    if (label.startsWith(q)) score = 0;
    else if (label.includes(q)) score = 1;
    else if (item.keywords.some((k) => k.toLowerCase().startsWith(q))) score = 2;
    else if (item.keywords.some((k) => k.toLowerCase().includes(q))) score = 3;
    else if (href.includes(q)) score = 4;
    if (score >= 0) scored.push({ item, score, idx });
  });

  return scored.sort((a, b) => a.score - b.score || a.idx - b.idx).map((s) => s.item);
}
