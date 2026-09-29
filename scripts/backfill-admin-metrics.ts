/**
 * Backfill historis admin_metrics_daily — jalankan ONCE (idempoten).
 * Perkiraan: data yang sudah dihapus tidak terhitung (is_estimated=true)
 * disimpan di kolom is_estimated.
 *
 * Jalankan:
 *   npx tsx scripts/backfill-admin-metrics.ts            → menulis
 *   npx tsx scripts/backfill-admin-metrics.ts --dry-run  → hanya hitung/rentang, tanpa menulis
 *
 * Hinweis: skrip HANYA menulis ke tabel admin_metrics_daily. Jalankan manual oleh owner,
 * bukan dari GitHub Actions (production akses manual).
 */
import { backfillAdminMetrics } from "../src/lib/admin-snapshot";
import { createServiceRoleClient } from "../src/lib/supabase/service";

async function assertReady(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "[backfill] ERR: env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset (set env dulu)."
    );
    process.exit(1);
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("admin_metrics_daily")
    .select("date", { count: "exact", head: true });
  if (error) {
    console.error(
      "[backfill] ERR: tabel admin_metrics_daily belum ada / acesso disposito: " +
        error.message +
        "\n→ Jalankan migration 026 dulu (isi dal file supabase/migrations/026_admin_metrics_daily.sql)."
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  await assertReady();

  const res = await backfillAdminMetrics({ days: 30, dryRun });

  if (dryRun) {
    console.log(
      `[backfill] DRY-RUN ok — rentang ${res.from}..${res.to}, jalan dariart ${res.plannedRows} baris (baca-only, belum ada tinta menulis).`
    );
    return;
  }

  console.log("[backfill] ok", JSON.stringify(res));
}

main();