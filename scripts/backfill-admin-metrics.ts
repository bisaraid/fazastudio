/**
 * Backfill historis admin_metrics_daily — jalankan ONCE (idempoten).
 * Perkiraan: data yang sudah dihapus tidak terhitung (is_estimated=true).
 *
 * Jalankan: npx tsx scripts/backfill-admin-metrics.ts
 */
import { backfillAdminMetrics } from "../src/lib/admin-snapshot";

async function main(): Promise<void> {
  const res = await backfillAdminMetrics({ days: 30 });
  console.log("[backfill] ok", JSON.stringify(res));
}

main();