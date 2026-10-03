#!/usr/bin/env node
/**
 * Orkestrasi TES SQL antrean render (supabase/migrations/032_render_queue.sql).
 *
 * Dua mode koneksi, dipilih otomatis:
 *   1. psql langsung  — bila PGHOST (atau DATABASE_URL) di-set. Dipakai CI
 *      (.github/workflows/db-tests.yml → service container Postgres).
 *   2. docker exec    — cadangan lokal: container supabase_db_* dari
 *      `npx supabase start`.
 *
 * Bagian uji:
 *   T9   4 sesi psql bersamaan mengklaim 30 job → tidak boleh ada job yang
 *        didapat dua sesi (FOR UPDATE SKIP LOCKED).
 *   T1-T8 render_queue.test.sql (idempotensi id, backoff 5s/10s, lease habis,
 *        kepemilikan worker, guard reuse, cleanup, hak akses, RLS per user).
 *
 * Hanya menyentuh DB uji (tidak pernah produksi): container lokal atau
 * service container CI.
 */
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = join(__dirname, "render_queue.test.sql");

function die(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

// ---------- 0. Mode koneksi ----------
const PSQL_ARGS = ["-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"];

function resolveConnection() {
  if (process.env.PGHOST || process.env.DATABASE_URL) {
    const cmd = process.env.PSQL_BIN || "psql";
    const args = [...PSQL_ARGS];
    if (process.env.PGDATABASE) args.push("-d", process.env.PGDATABASE);
    console.log(
      `[tes] mode psql langsung: ${cmd} ${process.env.PGHOST ?? "(DSN)"}:${process.env.PGPORT ?? "?"}`
    );
    return { cmd, args };
  }

  const ps = spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" });
  if (ps.status !== 0) die("docker tidak jalan: " + (ps.stderr || "").trim());
  const names = (ps.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const db = names.find((n) => n.startsWith("supabase_db_"));
  if (!db) die("container supabase_db_* tidak ada — jalankan `npx supabase start` dulu");
  console.log("[tes] mode docker exec, container:", db);
  return {
    cmd: "docker",
    args: ["exec", "-i", db, "psql", "-U", "postgres", "-d", "postgres", ...PSQL_ARGS],
  };
}

const CONN = resolveConnection();

/** Jalankan psql, kembalikan { code, out } (stdout + stderr digabung). */
function psqlRun(input) {
  const r = spawnSync(CONN.cmd, CONN.args, {
    encoding: "utf8",
    input,
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) die("gagal menjalankan psql: " + r.error.message);
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

/** Jalankan psql; gagalkan seluruh tes bila psql exit != 0. */
function psqlOk(input) {
  const r = psqlRun(input);
  if (r.code !== 0) die("psql gagal:\n" + r.out);
  return r.out;
}

// ---------- 1. Seed 30 job sintetis untuk uji konkurensi ----------
const SEED = `
delete from public.render_jobs where id like 'conc-%';
insert into public.render_jobs (id, project_id, identity_key, payload)
select 'conc-' || lpad(g::text, 2, '0'), 'p-conc', 'ik-conc', '{"synthetic":true}'::jsonb
  from generate_series(1, 30) g;
select count(*) from public.render_jobs where id like 'conc-%';
`;
const seedLines = psqlOk(SEED)
  .split(/\r?\n/)
  .map((l) => l.trim());
if (!seedLines.includes("30")) die("seed gagal, output: " + seedLines.join(" | "));
console.log("[tes] seed 30 job sintetis OK");

// ---------- 2. T9: empat sesi bersamaan mengklaim ----------
const CLAIM_ITERS = 10;
const PSET = "\\set QUIET on\n\\pset format unaligned\n\\pset tuples_only on\n\\pset null 'NULL'\n";

function workerInput(name) {
  let s = PSET;
  for (let i = 0; i < CLAIM_ITERS; i++) {
    s += `select coalesce((select id from public.claim_render_job('${name}', 90)), 'NULL');\n`;
    s += "select pg_sleep(0.15);\n";
  }
  return s;
}

function runWorker(name) {
  return new Promise((resolve) => {
    const p = spawn(CONN.cmd, CONN.args, { env: process.env });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ name, code, out, err }));
    p.stdin.write(workerInput(name));
    p.stdin.end();
  });
}

const results = await Promise.all(["w1", "w2", "w3", "w4"].map(runWorker));
const claims = [];
for (const r of results) {
  if (r.code !== 0) die(`sesi ${r.name} gagal:\n${r.err || r.out}`);
  for (const line of r.out.split(/\r?\n/)) {
    const v = line.trim();
    if (v.startsWith("conc-")) claims.push(v);
    else if (v === "NULL" || v.length === 0) continue;
    else if (!/^\(/.test(v)) console.log("[tes] baris tak dikenal:", v);
  }
  if (r.err.trim().length > 0) console.log(`[tes] stderr ${r.name}: ${r.err.trim()}`);
}

const uniq = new Set(claims);
console.log(`[tes T9] total klaim=${claims.length}, unik=${uniq.size}`);
if (claims.length !== uniq.size) {
  const dupes = [...new Set(claims.filter((c, i) => claims.indexOf(c) !== i))];
  die("T9 GAGAL — job didapat lebih dari satu sesi: " + dupes.join(","));
}
if (uniq.size !== 30) die(`T9 GAGAL — hanya ${uniq.size}/30 job terklaim`);

const attemptsLines = psqlOk(
  "select count(*) from public.render_jobs where id like 'conc-%' and attempts <> 1;"
)
  .split(/\r?\n/)
  .map((l) => l.trim());
if (!attemptsLines.includes("0")) {
  die("T9 GAGAL — ada job dengan attempts <> 1 (diklaim ganda): " + attemptsLines.join(" | "));
}
console.log("OK T9 — 4 sesi bersamaan: 30 job, tidak ada yang didapat 2 sesi, attempts=1 semua");


// ---------- 3. T1-T8 dari render_queue.test.sql ----------
console.log("[tes] menjalankan render_queue.test.sql ...");
const sql = readFileSync(SQL_FILE, "utf8");
const run = psqlRun(sql);
for (const line of run.out.split(/\r?\n/)) {
  const v = line.trim();
  if (v.includes("OK T") || v.includes("SEMUA TES")) console.log("  ", v);
}
if (!run.out.includes("SEMUA TES SQL LULUS")) {
  die("tes SQL tidak mencapai penanda lulus:\n" + run.out);
}

console.log("\nSEMUA TES LULUS (T1-T9)");

