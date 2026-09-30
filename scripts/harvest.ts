/**
 * Standalone Trend Harvester — Faza Studio
 *
 * Dijalankan di GitHub Actions (sumber kebenaran tunggal harvest) karena
 * Vercel Hobby timeout ±10 detik. SELURUH logika ada di
 * src/lib/trend-harvest.ts — route Vercel /api/cron/trends (trigger manual)
 * memakai modul yang sama, jadi perilaku keduanya identik.
 *
 * Env: YOUTUBE_API_KEY, GROQ_API_KEY2 (ekstraksi topik),
 *      GROQ_API_KEY (translate US), NEXT_PUBLIC_SUPABASE_URL,
 *      SUPABASE_SERVICE_ROLE_KEY.
 *
 * Catatan: modul di src/lib memakai alias "@/..." — tsx membaca tsconfig
 * paths, jadi aman dijalankan di luar konteks Next.js (diverifikasi).
 */

import { createServiceRoleClient } from "../src/lib/supabase/service";
import { runTrendHarvest } from "../src/lib/trend-harvest";

async function main(): Promise<void> {
  const supabase = createServiceRoleClient();

  const s = await runTrendHarvest(supabase);

  console.log(
    `[harvest] fetched youtube=${s.fetched.youtubeId} us=${s.fetched.youtubeUs} ` +
      `gt=${s.fetched.googleTrends} rss=${s.fetched.rss}`
  );
  console.log(
    `[harvest] extracted rss=${s.extracted.rss} youtube=${s.extracted.youtube} ` +
      `gt=${s.extracted.googleTrends} us=${s.extracted.youtubeUs}`
  );
  for (const n of s.byNiche) {
    console.log(`[harvest] niche=${n.niche} rows=${n.count}`);
  }
  console.log(
    `[harvest] baseline=${s.baselineRows} velocity up=${s.velocity.up} ` +
      `stable=${s.velocity.stable} down=${s.velocity.down} none=${s.velocity.none}`
  );
  for (const e of s.errors) console.warn(`[harvest] error: ${e}`);
  console.log(`[harvest] done rows=${s.batchRows} inserted=${s.inserted}`);

  // Gagal total (ada baris tapi 0 insert) → exit 1 supaya terlihat di Actions.
  process.exit(s.inserted === 0 && s.batchRows > 0 ? 1 : 0);
}

main();
