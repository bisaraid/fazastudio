#!/usr/bin/env node
// Sample renderer (dev tooling, offline). Replica i filtri di render.ts
// (zoom / crossfade / loudnorm / durate per scena). Nessuna API a pagamento.
//  node worker/scripts/render-sample.mjs [--out f] [--scenes N] [--dur S] [--crossfade] [--zoom] [--loudnorm]
import { createRequire } from "module";
import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import os from "os";
const req = createRequire(import.meta.url);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const flag = (n) => process.argv.includes(n);
const opts = { out: arg("--out", "sample.mp4"), N: Number(arg("--scenes", "3")), TOTAL: Math.max(4, Number(arg("--dur", "12"))), xf: flag("--crossfade"), zoom: flag("--zoom"), loud: flag("--loudnorm") };

const bin = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
function findFm() {
  if (process.env.FFMPEG_BIN && existsSync(process.env.FFMPEG_BIN)) return process.env.FFMPEG_BIN;
  try { const p = join(dirname(req.resolve("ffmpeg-static")), bin); if (existsSync(p)) return p; } catch {}
  for (const c of [join(process.cwd(), "node_modules", "ffmpeg-static", bin), join(process.cwd(), "worker", "node_modules", "ffmpeg-static", bin)]) if (existsSync(c)) return c;
  throw new Error("ffmpeg-static non trovato");
}
const fm = findFm();
const run = (a) => execFileSync(a[0], a.slice(1), { stdio: "inherit" });
const W = 1080, H = 1920;
const N = Math.max(1, Math.min(6, opts.N));
const OVER = 0.4;
const weights = Array.from({ length: N }, (_, i) => 1 + (i % 2) + (i * 7 % 3));
const wsum = weights.reduce((a, b) => a + b, 0);
const needed = opts.TOTAL + (opts.xf && N > 1 ? OVER * (N - 1) : 0);
const durs = weights.map((x) => (needed * x) / wsum);
const work = join(os.tmpdir(), "faza-sample-" + Date.now());
mkdirSync(work, { recursive: true });
console.log(`[sample] scenes=${N} total=${opts.TOTAL}s durs=[${durs.map((d) => d.toFixed(1)).join(",")}] opts=${JSON.stringify({ crossfade: opts.xf, zoom: opts.zoom, loudnorm: opts.loud })}}`);

// clip di sfondo distinti per scena
const srcs = ["testsrc=size=1080x1920:rate=30", "smptebars=size=1080x1920:rate=30", "color=c=0x1a2b4c:size=1080x1920:rate=30", "color=c=0x4c1a2b:size=1080x1920:rate=30", "gradients=size=1080x1920:speed=0.01:rate=30", "color=c=0x1b4a2c:size=1080x1920:rate=30"];
const clips = [];
for (let i = 0; i < N; i++) { const p = join(work, `c${i}.mp4`); run([fm, "-y", "-f", "lavfi", "-i", srcs[i % srcs.length], "-t", String(Math.ceil(durs[i]) + 1), "-pix_fmt", "yuv420p", p]); clips.push(p); }

// audio: segmenti sine per scena a volumi diversi (loudnorm li uniforma)
const segs = []; for (let i = 0; i < N; i++) { const s = join(work, `s${i}.wav`); run([fm, "-y", "-f", "lavfi", "-i", `sine=frequency=${280 + (i % 3) * 90}:sample_rate=44100:duration=${durs[i]}`, "-af", `volume=${[0.08, 0.35, 0.9][i % 3]}`, s]); segs.push(s); }
writeFileSync(join(work, "l.txt"), segs.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
const audio = join(work, "a.mp3"); run([fm, "-y", "-f", "concat", "-safe", "0", "-i", join(work, "l.txt"), "-c:a", "libmp3lame", audio]);

// SRT (una cue per scena)
const fmt = (x) => { const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = Math.floor(x % 60), ms = Math.floor((x % 1) * 1000); const p = (v, l = 2) => String(v).padStart(l, "0"); return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`; };
let startT = 0; const cues = [];
for (let i = 0; i < N; i++) { const a = startT, b = startT + durs[i]; cues.push(`${i + 1}\n${fmt(a)} --> ${fmt(b)}\nScene ${i + 1} | qualita sample`); startT = b; }
const srt = join(work, "s.srt"); writeFileSync(srt, cues.join("\n\n"));

// filter_complex
const scale = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`;
const zoomF = `zoompan=z='min(1+0.0006*on,1.06)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=30`;
const parts = [];
for (let i = 0; i < N; i++) { parts.push(`[${i}:v]${scale}${opts.zoom ? "," + zoomF : ""},trim=duration=${durs[i]},setpts=PTS-STARTPTS,format=yuv420p[v${i}]`); }
let baseLabel;
if (opts.xf && N > 1) {
  let acc = durs[0];
  for (let i = 1; i < N; i++) { const off = acc - OVER; const pa = i === 1 ? "v0" : `vid${i - 1}`; parts.push(`[${pa}][v${i}]xfade=transition=fade:duration=${OVER}:offset=${off}[vid${i}]`); acc = acc + durs[i] - OVER; }
  baseLabel = `[vid${N - 1}]`;
} else {
  const ins = Array.from({ length: N }, (_, i) => `[v${i}]`).join(""); parts.push(`${ins}concat=n=${N}:v=1:a=0[base]`); baseLabel = "[base]";
}
parts.push(`${baseLabel}subtitles=s.srt:force_style='FontName=Arial,Fontsize=26,PrimaryColour=&H00FFFFFF'[vout]`);
const filter = parts.join(";");
const inputs = []; for (const c of clips) inputs.push("-stream_loop", "-1", "-i", c); inputs.push("-i", audio);
const outAbs = join(process.cwd(), opts.out);
const args = ["-filter_complex", filter, "-map", "[vout]", "-map", `${N}:a`];
if (opts.loud) args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
args.push("-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-shortest", "-t", String(opts.TOTAL), "-movflags", "+faststart", "-y", outAbs);
try { execFileSync(fm, [...inputs, ...args], { stdio: "inherit", cwd: work }); console.log(`\n[sample] OK -> ${outAbs}`); } catch (e) { console.error(`[sample] FFmpeg fallito: ${e}`); process.exit(1); } finally { try { rmSync(work, { recursive: true, force: true }); } catch {} }