/**
 * Test murni untuk PEMBANGUN filtergraph di worker/src/render.ts:
 *   - buildSceneChain()  → chain per-scene (scale/pad/zoom/trim + xfade|concat)
 *   - buildFinalChain()  → chain terakhir `[label]subtitles=…[vout]`
 *
 * Kenapa node:test: worker tidak punya setup vitest (lihat filter-escape.node-test.ts).
 * Nama `*.node-test.ts` supaya tidak ikut terambil vitest root.
 *
 * Cara menjalankan (dari folder `worker/`):
 *   npx ts-node __tests__/filter-graph.node-test.ts
 *
 * Fokus: VALIDITAS LABEL. Bug yang diperbaiki memunculkan
 *   "More input link labels specified for filter 'subtitles' than it has inputs: 2 > 1"
 * karena chain subtitle membawa `[base]` sendiri padahal label input sudah
 * ditulis oleh pemanggil (`[vid2]` untuk xfade / `[base]` untuk concat).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildFinalChain, buildSceneChain, escapeFilterPath, roundFilterSeconds } from "../src/render";

/** Arity filter yang dipakai di chain render (jumlah input yang diterima). */
const ARITY: Record<string, number | "n"> = {
  scale: 1, pad: 1, trim: 1, setpts: 1, format: 1, zoompan: 1,
  subtitles: 1, drawtext: 1, null: 1, xfade: 2, concat: "n",
};

/** Pisah body chain dengan koma level-atas (abaikan koma di dalam 'quote' / `\,`). */
function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "\\" && i + 1 < body.length) {
      cur += ch + body[i + 1];
      i += 1;
      continue;
    }
    if (ch === "'") quoted = !quoted;
    if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

interface ChainInfo {
  /** Label input eksplisit di awal chain (mis. `0:v`, `vid2`). */
  inputs: string[];
  /** Sub-filter (dipisah koma), dalam urutan. */
  filters: string[];
  /** Label output di akhir chain (bila ada). */
  output: string | null;
}

function parseChain(segment: string): ChainInfo {
  let s = segment.trim();
  const inputs: string[] = [];
  while (s.startsWith("[")) {
    const end = s.indexOf("]");
    inputs.push(s.slice(1, end));
    s = s.slice(end + 1);
  }
  let output: string | null = null;
  if (s.endsWith("]")) {
    const start = s.lastIndexOf("[");
    output = s.slice(start + 1, -1);
    s = s.slice(0, start);
  }
  return { inputs, filters: splitTopLevel(s), output };
}

/**
 * Validator struktur graph: setiap chain harus menerima JUMLAH label input
 * (termasuk input stream `0:v`) yang sama dengan arity filter pertamanya, dan
 * setiap label bernama harus dihasilkan tepat sekali serta dikonsumsi sekali.
 */
function graphProblems(segments: string[]): string[] {
  const problems: string[] = [];
  const produced = new Map<string, number>();
  const consumed = new Map<string, number>();

  for (const segment of segments) {
    const info = parseChain(segment);
    const first = info.filters[0] ?? "";
    const name = first.split("=")[0];
    const arity = name === "concat"
      ? Number(/n=(\d+)/.exec(first)?.[1] ?? 1)
      : (ARITY[name] ?? 1);
    if (info.inputs.length !== arity) {
      problems.push(`filter '${name}' menerima ${info.inputs.length} label input, seharusnya ${arity} :: ${segment}`);
    }
    // Input stream (`0:v`) bukan hasil filter lain → tidak masuk bookkeeping.
    for (const l of info.inputs.filter((x) => !/^\d+:[va]$/.test(x))) {
      consumed.set(l, (consumed.get(l) ?? 0) + 1);
    }
    if (info.output) produced.set(info.output, (produced.get(info.output) ?? 0) + 1);
  }

  for (const [l, c] of consumed) if (c !== 1) problems.push(`label [${l}] dipakai ${c}x`);
  for (const [l, c] of produced) if (c !== 1) problems.push(`label [${l}] dihasilkan ${c}x`);
  for (const [l] of consumed) if (!produced.has(l)) problems.push(`label [${l}] dipakai tapi tidak pernah dihasilkan`);
  return problems;
}

/** Chain subtitle realistis (+ watermark) yang dipakai semua cabang render. */
function subtitleChainBodyWithWatermark(): string {
  const srt = escapeFilterPath("C:\\Users\\me\\AppData\\Local\\Temp\\acs-video-1\\subtitle.srt");
  const fonts = escapeFilterPath("C:\\Users\\me\\AppData\\Local\\Temp\\acs-video-1\\fonts");
  const font = escapeFilterPath("C:\\Users\\me\\AppData\\Local\\Temp\\acs-video-1\\fonts\\Quicksand_Book.otf");
  return (
    "subtitles=" + srt + ":fontsdir=" + fonts + ":force_style='FontName=Quicksand,Fontsize=26'" +
    ",drawtext=fontfile=" + font + ":text='Faza Studio':x=w-tw-20:y=h-th-16:fontsize=16:fontcolor=white@0.7"
  );
}

const SCALE_PAD = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2";
const ZOOM = "zoompan=z='min(1+0.0006*on,1.06)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30";
const OVER = 0.4;

// ============================================================
// buildFinalChain
// ============================================================
test("buildFinalChain: satu label input + [vout] di akhir", () => {
  const chain = buildFinalChain("[vid2]", "subtitles=/tmp/s.srt");
  assert.equal(chain, "[vid2]subtitles=/tmp/s.srt[vout]");
  assert.equal(parseChain(chain).inputs.length, 1);
  assert.equal(parseChain(chain).output, "vout");
});

test("buildFinalChain: label boleh tanpa bracket", () => {
  assert.equal(buildFinalChain("base", "x=1"), "[base]x=1[vout]");
});

test("buildFinalChain: TIDAK pernah menyisipkan [base] sendiri", () => {
  const plan = buildSceneChain({
    sceneDurations: [3, 2], scalePad: SCALE_PAD, useZoom: false, useCrossfade: true, crossfadeDuration: OVER,
  });
  const chain = buildFinalChain(plan.baseLabel, subtitleChainBodyWithWatermark());
  assert.ok(!chain.includes("[base]"), chain);
  assert.ok(chain.startsWith("[vid1]subtitles="), chain);
  // Graph lengkap (plan + chain akhir) valid
  assert.deepEqual(graphProblems(plan.parts.concat(chain)), []);
});

// ============================================================
// buildSceneChain — jumlah scene 1, 2, 3
// ============================================================
test("buildSceneChain n=1: fallback ke concat (bukan xfade) → [base]", () => {
  const plan = buildSceneChain({
    sceneDurations: [3], scalePad: SCALE_PAD, useZoom: false, useCrossfade: true, crossfadeDuration: OVER,
  });
  // 1 chain scene + 1 chain concat
  assert.equal(plan.parts.length, 2);
  assert.equal(plan.baseLabel, "[base]");
  assert.ok(plan.parts[1].includes("concat=n=1:v=1:a=0[base]"));
  assert.ok(!plan.parts.some((p) => p.includes("xfade")));
});

test("buildSceneChain n=2 crossfade: label [vid1], offset = d0 - OVER", () => {
  const plan = buildSceneChain({
    sceneDurations: [3, 2], scalePad: SCALE_PAD, useZoom: false, useCrossfade: true, crossfadeDuration: OVER,
  });
  assert.equal(plan.parts.length, 3); // 2 scene + 1 xfade
  assert.equal(plan.baseLabel, "[vid1]");
  assert.ok(plan.parts[2].startsWith("[v0][v1]xfade=transition=fade:duration=0.4:offset=2.6"));
  assert.ok(plan.parts[2].endsWith("[vid1]"));
});

test("buildSceneChain n=3 crossfade: dua xfade berurutan + label [vid2]", () => {
  const plan = buildSceneChain({
    sceneDurations: [3, 2, 2], scalePad: SCALE_PAD, useZoom: false, useCrossfade: true, crossfadeDuration: OVER,
  });
  assert.equal(plan.parts.length, 5); // 3 scene + 2 xfade
  assert.equal(plan.baseLabel, "[vid2]");
  assert.ok(plan.parts[3].startsWith("[v0][v1]xfade="));
  assert.ok(plan.parts[4].startsWith("[vid1][v2]xfade="));
  // offset kedua = d0 + d1 - 2*OVER = 3 + 2 - 0.8 = 4.2 (bandingkan numerik:
  // nilai string bisa mengandung artefak float, mis. 4.199999999999999)
  const off = /offset=([0-9.]+)/.exec(plan.parts[4]);
  assert.ok(off, plan.parts[4]);
  assert.ok(Math.abs(Number(off?.[1]) - 4.2) < 1e-9, "offset=" + (off?.[1]));
  assert.deepEqual(graphProblems(plan.parts), []);
});

test("buildSceneChain n=3 tanpa crossfade: concat 3 input", () => {
  const plan = buildSceneChain({
    sceneDurations: [3, 2, 2], scalePad: SCALE_PAD, useZoom: false, useCrossfade: false, crossfadeDuration: OVER,
  });
  assert.equal(plan.parts.length, 4);
  assert.equal(plan.baseLabel, "[base]");
  assert.ok(plan.parts[3].startsWith("[v0][v1][v2]concat=n=3:v=1:a=0[base]"));
  assert.deepEqual(graphProblems(plan.parts), []);
});

test("buildSceneChain: zoom hanya menempel bila useZoom", () => {
  const withZoom = buildSceneChain({
    sceneDurations: [2], scalePad: SCALE_PAD, useZoom: true, useCrossfade: false, crossfadeDuration: OVER, zoomFilter: ZOOM,
  });
  const noZoom = buildSceneChain({
    sceneDurations: [2], scalePad: SCALE_PAD, useZoom: false, useCrossfade: false, crossfadeDuration: OVER, zoomFilter: ZOOM,
  });
  assert.ok(withZoom.parts[0].includes("zoompan="));
  assert.ok(!noZoom.parts[0].includes("zoompan="));
  assert.ok(withZoom.parts[0].endsWith("[v0]"));
});

// ============================================================
// Validitas graph lengkap (persis bentuk yang dikirim ke -filter_complex)
// ============================================================
test("graph auto per-scene VALID untuk n=1, 2, 3 (mode xfade+zoom)", () => {
  for (const durations of [[3], [3, 2], [3, 2, 2]]) {
    const plan = buildSceneChain({
      sceneDurations: durations, scalePad: SCALE_PAD, useZoom: true,
      useCrossfade: durations.length >= 2, crossfadeDuration: OVER, zoomFilter: ZOOM,
    });
    const graph = plan.parts.concat(buildFinalChain(plan.baseLabel, subtitleChainBodyWithWatermark()));
    assert.deepEqual(graphProblems(graph), [], "graph n=" + durations.length + " :: " + graph.join(";"));
    // label video terakhir hanya muncul SEKALI sebagai input chain subtitle
    const lastChain = graph[graph.length - 1];
    assert.equal(parseChain(lastChain).inputs.length, 1);
  }
});

test("graph cabang sceneFootage (concat + [base]) tetap VALID", () => {
  const parts = [
    "[0:v]" + SCALE_PAD + ",trim=duration=5,setpts=PTS-STARTPTS[v0]",
    "[1:v]" + SCALE_PAD + ",trim=duration=5,setpts=PTS-STARTPTS[v1]",
    "[v0][v1]concat=n=2:v=1:a=0[base]",
  ];
  const graph = parts.concat(buildFinalChain("[base]", subtitleChainBodyWithWatermark()));
  assert.deepEqual(graphProblems(graph), []);
});

test("REGRESI bug lama: label `[base]` di dalam chain subtitle terdeteksi", () => {
  const plan = buildSceneChain({
    sceneDurations: [3, 2], scalePad: SCALE_PAD, useZoom: false, useCrossfade: true, crossfadeDuration: OVER,
  });
  // Bentuk graph LAMA: `baseLabel` + chain yang MASIH membawa `[base]` sendiri.
  const oldStyle = plan.parts.concat(plan.baseLabel + "[base]subtitles=/tmp/s.srt:force_style='a'[vout]");
  const problems = graphProblems(oldStyle);
  assert.ok(
    problems.some((p) => /'subtitles' menerima 2 label input/.test(p)),
    problems.join(" | ")
  );

  // Versi baru (buildFinalChain) bersih untuk graph yang sama.
  const fixed = plan.parts.concat(buildFinalChain(plan.baseLabel, "subtitles=/tmp/s.srt:force_style='a'"));
  assert.deepEqual(graphProblems(fixed), []);

  // Cabang concat juga rusak dengan bentuk lama, dan bersih dengan bentuk baru.
  const concatBroken = ["[0:v]scale=1:1[v0]", "[v0]concat=n=1:v=1:a=0[base]", "[base][base]subtitles=/tmp/s.srt[vout]"];
  assert.ok(graphProblems(concatBroken).some((p) => /'subtitles' menerima 2 label input/.test(p)));
  const concatFixed = ["[0:v]scale=1:1[v0]", "[v0]concat=n=1:v=1:a=0[base]", buildFinalChain("[base]", "subtitles=/tmp/s.srt")];
  assert.deepEqual(graphProblems(concatFixed), []);
});

// ============================================================
// Pembulatan nilai waktu (item 6) — graph bersih tanpa artefak float
// ============================================================
test("roundFilterSeconds: maksimal 3 desimal", () => {
  assert.equal(roundFilterSeconds(1.6800000000000002), 1.68);
  assert.equal(roundFilterSeconds(4.199999999999999), 4.2);
  assert.equal(roundFilterSeconds(2.8000000000000003), 2.8);
  assert.equal(String(roundFilterSeconds(0.7999999999999999)), "0.8");
  assert.equal(roundFilterSeconds(3), 3);
});

test("buildSceneChain: graph bebas artefak float (durasi & offset <=3 desimal)", () => {
  const messy = [1.6800000000000002, 2.8000000000000003, 1.3000000000000003];
  const plan = buildSceneChain({
    sceneDurations: messy, scalePad: SCALE_PAD, useZoom: true,
    useCrossfade: true, crossfadeDuration: OVER, zoomFilter: ZOOM,
  });
  const graph = plan.parts.join(";");
  // Hanya nilai yang DIHITUNG (trim duration & xfade offset) yang boleh diperiksa —
  // konstanta internal filter (mis. `min(1+0.0006*on,1.06)` di zoompan) bukan artefak.
  assert.ok(!/(trim=duration|offset)=\d+\.\d{4,}/.test(graph), "masih ada artefak float: " + graph);
  for (const m of graph.matchAll(/duration=([\d.]+)/g)) {
    assert.ok(/^\d+(\.\d{1,3})?$/.test(m[1]), "duration=" + m[1]);
  }
  for (const m of graph.matchAll(/offset=([\d.]+)/g)) {
    assert.ok(/^\d+(\.\d{1,3})?$/.test(m[1]), "offset=" + m[1]);
  }
  // graph tetap valid secara struktur + jumlah chain tidak berubah
  assert.equal(plan.parts.length, messy.length + (messy.length - 1));
  assert.equal(plan.baseLabel, "[vid2]");
});

test("buildSceneChain: pembulatan menggeser total <= 0,5 ms per scene", () => {
  const messy = [1.6800000000000002, 2.8000000000000003, 1.3000000000000003];
  const plan = buildSceneChain({
    sceneDurations: messy, scalePad: SCALE_PAD, useZoom: false,
    useCrossfade: false, crossfadeDuration: OVER,
  });
  const rounded = messy.map(roundFilterSeconds);
  const drift = messy.reduce((s, d, i) => s + Math.abs(d - rounded[i]), 0);
  assert.ok(drift <= 0.0005 * messy.length, "drift=" + drift);
  // trim yang tertulis di graph = durasi terbulat
  rounded.forEach((d, i) => assert.ok(plan.parts[i].includes("trim=duration=" + d + ",")));
});
