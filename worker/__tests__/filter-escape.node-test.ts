/**
 * Unit test MURNI untuk `escapeFilterPath()` (worker/src/render.ts).
 *
 * Kenapa `node:test` (bukan vitest):
 * - Worker tidak punya setup test sendiri (worker/package.json tanpa runner),
 *   jadi dipakai test runner BAWAAN Node → nol dependency baru.
 * - Nama file `*.node-test.ts` (bukan `*.test.ts`) supaya TIDAK ikut terambil
 *   oleh vitest di root (`npm test` di root memakai glob default `*.test.ts`),
 *   jadi hasil suite root tidak berubah.
 * - File berada DI LUAR folder `worker/src`, sehingga `npm run build` (worker
 *   tsc dengan `include` terbatas pada folder itu) tidak mengompilasi file
 *   test ini ke `dist/`.
 *
 * Cara menjalankan (dari folder `worker/`):
 *   npx ts-node __tests__/filter-escape.node-test.ts
 *
 * Yang diuji:
 * 1. Path Windows (drive `C:` + backslash) → titik dua dikirim sebagai `\\:`.
 * 2. Path Linux/macOS tanpa karakter spesial → KELUAR IDENTIK (tanpa regresi).
 * 3. Path dengan spasi, koma, kutip tunggal, kurung siku → tetap utuh.
 * 4. Simulasi parser ffmpeg 2 level (level-2 filtergraph → level-1 nilai opsi)
 *    membuktikan filename yang dilihat ffmpeg sama dengan path asli, dan
 *    membuktikan escaping LAMA (`\:` satu backslash) memang GAGAL diparse
 *    (mereproduksi gejala "Unable to parse option value ... as image size").
 */

import test from "node:test";
import assert from "node:assert/strict";

import { escapeFilterPath } from "../src/render";

/** Satu backslash. */
const ONE = "\\";
/** Dua backslash — bentuk yang harus DIKIRIM ke ffmpeg untuk `C:` di path. */
const TWO = "\\\\";

/**
 * Unescape satu level ffmpeg: `\X` → `X` (backslash "menghabiskan" karakter
 * berikutnya). Dipakai untuk mensimulasikan parser filtergraph.
 */
function unescapeOnce(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === "\\" && i + 1 < input.length) {
      out += input[i + 1];
      i += 1;
    } else {
      out += input[i];
    }
  }
  return out;
}

/**
 * Simulasi ffmpeg saat membaca nilai opsi pertama (mis. `filename` pada
 * `subtitles=...`):
 *   - level 2 (deskripsi filtergraph) di-unescape lebih dulu,
 *   - level 1 (nilai opsi) memotong nilai pada `:` yang TIDAK di-escape.
 * Return `null` bila ketemu `:` mentah di level 1 → itulah kondisi error
 * "Unable to parse option value ... as image size" (path terpotong).
 */
function parseFirstOptionValue(filterArg: string): string | null {
  const level1View = unescapeOnce(filterArg); // teks yang dibaca parser level 1
  let value = "";
  for (let i = 0; i < level1View.length; i += 1) {
    const ch = level1View[i];
    if (ch === "\\" && i + 1 < level1View.length) {
      value += level1View[i + 1];
      i += 1;
      continue;
    }
    if (ch === ":") return null; // pemisah opsi mentah → path terpotong
    value += ch;
  }
  return value;
}

// ============================================================
// 1. Windows: drive + backslash (kasus bug yang dilaporkan)
// ============================================================
const WIN_SRT =
  "C:" + ONE + "Users" + ONE + "me" + ONE + "AppData" + ONE + "Local" + ONE +
  "Temp" + ONE + "acs-video-1" + ONE + "subtitle.srt";
const WIN_SRT_POSIX = "C:/Users/me/AppData/Local/Temp/acs-video-1/subtitle.srt";
const WIN_SRT_ESCAPED = "C" + TWO + ":" + WIN_SRT_POSIX.slice(2);

test("Windows: titik dua drive dikirim sebagai dua backslash", () => {
  assert.equal(escapeFilterPath(WIN_SRT), WIN_SRT_ESCAPED);
});

test("Windows: backslash path jadi slash (tak perlu di-escape dua kali)", () => {
  assert.ok(!escapeFilterPath(WIN_SRT).includes(ONE + "Users"));
  assert.ok(escapeFilterPath(WIN_SRT).includes("/Users/me/"));
});

test("Windows: TIDAK boleh ada titik dua satu-backslash (bentuk bug lama)", () => {
  const escaped = escapeFilterPath(WIN_SRT);
  // pola `\:` yang didahului bukan-backslash = hanya satu backslash
  assert.ok(!/(^|[^\\])\\:/.test(escaped), "escaping harus 2 backslash: " + escaped);
});

test("Windows: drive letter huruf kecil juga ditangani", () => {
  assert.equal(escapeFilterPath("d:" + ONE + "work" + ONE + "s.srt"), "d" + TWO + ":/work/s.srt");
});

test("Windows: input sudah pakai slash tetap benar", () => {
  assert.equal(escapeFilterPath("C:/Users/me/subtitle.srt"), "C" + TWO + ":/Users/me/subtitle.srt");
});

// ============================================================
// 2. Linux/macOS: TIDAK berubah (regression guard)
// ============================================================
const LINUX_SRT = "/tmp/acs-video-abc123/subtitle.srt";

test("Linux: path tanpa karakter spesial keluar IDENTIK", () => {
  assert.equal(escapeFilterPath(LINUX_SRT), LINUX_SRT);
});

test("macOS: path dengan spasi keluar IDENTIK", () => {
  const macPath = "/Users/me/My Project/sub title.srt";
  assert.equal(escapeFilterPath(macPath), macPath);
});

test("Windows: spasi tidak diubah, hanya colon yang di-escape", () => {
  assert.equal(
    escapeFilterPath("C:" + ONE + "Program Files" + ONE + "Faza" + ONE + "fonts"),
    "C" + TWO + ":/Program Files/Faza/fonts"
  );
});

// ============================================================
// 3. Karakter spesial lain: koma, titik koma, kurung siku, kutip tunggal
// ============================================================
test("koma / titik koma / kurung siku di-escape untuk level 2 (filtergraph)", () => {
  assert.equal(escapeFilterPath("/tmp/a,b/c.srt"), "/tmp/a" + ONE + ",b/c.srt");
  assert.equal(escapeFilterPath("/tmp/a;b/c.srt"), "/tmp/a" + ONE + ";b/c.srt");
  // `[` dan `]` adalah penanda label/pad di filtergraph → keduanya di-escape.
  assert.equal(escapeFilterPath("/tmp/a[1]/c.srt"), "/tmp/a" + ONE + "[1" + ONE + "]/c.srt");
});

test("kutip tunggal di-escape untuk dua level", () => {
  // level 1: ' -> \' ; level 2: \ -> \\ lalu ' -> \'  ⇒ hasil 3 backslash + '
  assert.equal(escapeFilterPath("/tmp/it's/c.srt"), "/tmp/it" + ONE + ONE + ONE + "'s/c.srt");
});

// ============================================================
// 4. Simulasi parser ffmpeg 2 level (statis, tanpa ffmpeg)
// ============================================================
test("simulasi parse: filename Windows terbaca UTUH", () => {
  assert.equal(parseFirstOptionValue(escapeFilterPath(WIN_SRT)), WIN_SRT_POSIX);
});

test("simulasi parse: path kompleks (koma + kutip + spasi) terbaca UTUH", () => {
  const messy = "C:" + ONE + "Program Files" + ONE + "Faza," + ONE + "it's" + ONE + "sub title.srt";
  assert.equal(parseFirstOptionValue(escapeFilterPath(messy)), messy.replace(/\\/g, "/"));
});

test("simulasi parse: path Linux (srt & fontsdir) terbaca UTUH", () => {
  assert.equal(parseFirstOptionValue(escapeFilterPath(LINUX_SRT)), LINUX_SRT);
  const linuxFonts = "/tmp/acs-video-abc123/fonts";
  assert.equal(parseFirstOptionValue(escapeFilterPath(linuxFonts)), linuxFonts);
});

test("BUKTI bug lama: titik dua satu-backslash GAGAL diparse (path terpotong)", () => {
  const broken = "C" + ONE + ":/Users/me/subtitle.srt"; // hasil escapeFilterPath SEBELUM fix
  assert.equal(parseFirstOptionValue(broken), null);
  // Yang benar: dua backslash → terparse utuh
  assert.equal(
    parseFirstOptionValue("C" + TWO + ":/Users/me/subtitle.srt"),
    "C:/Users/me/subtitle.srt"
  );
});

// ============================================================
// 5. Bentuk filter nyata (subtitles + fontsdir + drawtext fontfile)
// ============================================================
test("filter subtitles: path srt & fontsdir sama-sama ter-escape", () => {
  const fontsDir = "C:" + ONE + "Temp" + ONE + "fonts";
  const filter =
    "subtitles=" + escapeFilterPath(WIN_SRT) + ":fontsdir=" + escapeFilterPath(fontsDir) +
    ":force_style='FontName=Quicksand'";
  assert.equal(
    filter,
    "subtitles=" + WIN_SRT_ESCAPED + ":fontsdir=C" + TWO + ":/Temp/fonts:force_style='FontName=Quicksand'"
  );
  assert.equal(parseFirstOptionValue(escapeFilterPath(WIN_SRT)), WIN_SRT_POSIX);
});

test("drawtext fontfile: path Windows ter-escape dengan benar", () => {
  const font = "C:" + ONE + "Temp" + ONE + "fonts" + ONE + "Quicksand_Book.otf";
  const draw = "drawtext=fontfile=" + escapeFilterPath(font) + ":text='Faza Studio'";
  assert.equal(draw, "drawtext=fontfile=C" + TWO + ":/Temp/fonts/Quicksand_Book.otf:text='Faza Studio'");
  assert.equal(parseFirstOptionValue(escapeFilterPath(font)), "C:/Temp/fonts/Quicksand_Book.otf");
});
