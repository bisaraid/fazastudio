/**
 * Backfill riwayat admin_metrics_daily — jalankan SEKALI (idempoten).
 * Nilai bersifat perkiraan: data yang sudah dihapus tidak terhitung
 * (baris ditandai is_estimated=true).
 *
 * Cara jalankan:
 *   npx tsx scripts/backfill-admin-metrics.ts            → menulis ke tabel
 *   npx tsx scripts/backfill-admin-metrics.ts --dry-run  → hanya menghitung & menampilkan rentang, tanpa menulis
 *
 * Catatan: skrip HANYA menulis ke tabel admin_metrics_daily. Dijalankan manual oleh owner,
 * tidak dipanggil dari GitHub Actions.
 */
import { backfillAdminMetrics } from "../src/lib/admin-snapshot";
import { createServiceRoleClient } from "../src/lib/supabase/service";

async function assertReady(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "[backfill] ERROR: env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi. Isi env dulu."
    );
    process.exit(1);
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("admin_metrics_daily")
    .select("date", { count: "exact", head: true });
  if (error) {
    console.error(
      "[backfill] ERROR: tabel admin_metrics_daily belum ada atau tidak bisa diakses: " +
        error.message +
        "\n→ Jalankan migration 026 dulu (file supabase/migrations/026_admin_metrics_daily.sql)."
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
      `[backfill] DRY-RUN selesai — rentang ${res.from}..${res.to}, akan menulis ${res.plannedRows} baris (mode baca saja, tidak ada data ditulis).`
    );
    return;
  }

  console.log("[backfill] selesai", JSON.stringify(res));
}

main();