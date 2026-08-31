import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm, mkdir, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { validateApiKey } from "@/lib/api-auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getServerIdentity, buildDeviceCookieHeader } from "@/lib/identity";
import { checkCredits, getUsage } from "@/lib/usage";
import { uploadToR2 } from "@/lib/r2";

/**
 * POST /api/generate-video
 *
 * Real video render via FFmpeg NATIVE (ffmpeg-static) + Pexels background + Cloudflare R2.
 * - Input: audioUrl, subtitleUrl, projectId, genre
 * - Proses: fetch audio + subtitle + background visual → FFmpeg native compose → mp4
 * - Output: upload ke Cloudflare R2 (free/" atau "premium/"), return public URL
 *
 * Response: Server-Sent Events (SSE) stream:
 *   data: {"percent": 0..100}
 *   data: {"status":"done","videoUrl":"..."}
 *   data: {"status":"error","message":"..."}
 *
 * Body:
 * {
 *   audioUrl: string (wajib),
 *   subtitleUrl: string (wajib),
 *   projectId: string (wajib),
 *   genre: string (opsional, untuk query Pexels),
 *   backgroundUrl: string (opsional — URL footage yang dipilih user dari /api/footage),
 *   subtitleSegments: SubtitleSegment[] (opsional — SOURCE OF TRUTH dari project state),
 *   subtitleStyle: SubtitleStyle (opsional — style caption)
 * }
 *
 * SRT untuk FFmpeg dibangun dari subtitleSegments (source of truth).
 * subtitleUrl tetap dipertahankan sebagai fallback untuk backward compatibility.
 * SRT adalah artifact sementara untuk FFmpeg, BUKAN source of truth.
 *
 * FFmpeg engine: ffmpeg-static (native binary), dijalankan via child_process.spawn.
 * Durasi audio didapat via `ffmpeg -i input.mp3` (parse "Duration:" dari stderr),
 * karena ffmpeg-static tidak menyertakan binary ffprobe.
 * Route Handler berjalan di Node.js runtime (bukan ffmpeg.wasm).
 */

export const runtime = "nodejs";

const PEXELS_API_URL = "https://api.pexels.com/videos/search";

/**
 * Resolve path absolut ke binary ffmpeg-static di node_modules.
 *
 * PENTING: JANGAN pakai `import ffmpegPath from "ffmpeg-static"` — Next.js
 * me-bundle module tsb dan `__dirname` di bundle menunjuk ke
 * `.next/server/vendor-chunks/`, bukan `node_modules/ffmpeg-static/`.
 * Akibatnya path binary menjadi virtual dan `execFile` gagal ENOENT.
 *
 * Prioritas:
 * 1. `FFMPEG_BIN` env var (jika di-set DAN file ada)
 * 2. `require.resolve("ffmpeg-static")` → path absolut ke index.js → ffmpeg.exe
 * 3. Fallback: `process.cwd()/node_modules/ffmpeg-static/ffmpeg.exe`
 */
function resolveFfmpegPath(): string {
  // 1. Env var FFMPEG_BIN (jika di-set dan valid)
  if (process.env.FFMPEG_BIN && existsSync(process.env.FFMPEG_BIN)) {
    return process.env.FFMPEG_BIN;
  }

  // 2. require.resolve → path absolut module asli di node_modules
  try {
    const modulePath = require.resolve("ffmpeg-static");
    const candidate = join(dirname(modulePath), "ffmpeg.exe");
    if (existsSync(candidate)) {
      return candidate;
    }
  } catch {
    // ignore — lanjut ke fallback
  }

  // 3. Fallback: path absolut dari process.cwd() (root project)
  const fallback = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe");
  if (existsSync(fallback)) {
    return fallback;
  }

  return "";
}

/**
 * Escape path untuk dipakai dalam FFmpeg filtergraph `subtitles=` di Windows.
 *
 * FFmpeg filter parser memakai `\`, `:`, `'`, dan `,` sebagai syntax.
 * Path Windows (mis. `C:\Users\...\subtitle.srt`) mengandung `C:` dan `\`
 * yang jika dimasukkan mentah akan diparse sebagai syntax filter
 * (drive letter colon → pemisah argumen, backslash → escape character),
 * menyebabkan error "Unable to parse option value ... as image size".
 *
 * Aturan escaping:
 * - `\` → `\\` (gandakan backslash)
 * - `:` → `\:` (escape colon, termasuk drive letter)
 * - `'` → `\'` (escape apostrophe)
 * - `,` → `\,` (escape comma)
 */
function escapeFilterPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, '$1\\\\:');
}

/** Format detik → SRT time (HH:MM:SS,mmm) */
function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

/**
 * Pecah satu segment menjadi beberapa cue subtitle berisi maksimal 3 kata.
 * Timing didistribusikan proporsional berdasarkan jumlah kata tiap chunk.
 */
function splitSegmentIntoCues(segment: { start: number; end: number; text: string }): { start: number; end: number; text: string }[] {
  const words = segment.text.split(/\s+/).filter(Boolean);
  if (words.length <= 3) {
    return [{ start: segment.start, end: segment.end, text: words.join(" ") }];
  }
  const duration = segment.end - segment.start;
  const cues: { start: number; end: number; text: string }[] = [];
  let cueStart = segment.start;
  for (let i = 0; i < words.length; i += 3) {
    const chunk = words.slice(i, i + 3);
    const chunkDuration = (chunk.length / words.length) * duration;
    const cueEnd = cueStart + chunkDuration;
    cues.push({ start: cueStart, end: cueEnd, text: chunk.join(" ") });
    cueStart = cueEnd;
  }
  return cues;
}

function buildSrtFromSegments(
  segments: { id?: string; startTime?: number; endTime?: number; start?: number; end?: number; text?: string }[],
  _style?: { fontSize?: number; color?: string; position?: "bottom" | "top"; fontFamily?: string }
): string {
  return segments
    .flatMap((seg) => {
      const start = seg.startTime ?? seg.start;
      const end = seg.endTime ?? seg.end;
      const text = (seg.text || "").trim();
      if (typeof start !== "number" || typeof end !== "number" || end <= start || !text) return [];
      return splitSegmentIntoCues({ start, end, text });
    })
    .map((cue, i) => `${i + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}`)
    .join("\n\n");
}

/** Konversi warna hex "#RRGGBB" → ASS "&H00BBGGRR" (alpha 0 = opak, urutan BGR). */
function hexToAssColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return "&H00FFFFFF"; // fallback putih
  const r = m[1].slice(0, 2);
  const g = m[1].slice(2, 4);
  const b = m[1].slice(4, 6);
  return `&H00${b}${g}${r}`;
}

/** Family font (internal) untuk libass. */
const SUBTITLE_FONT_NAME = "Quicksand";
const SUBTITLE_FONT_FALLBACK = "Poppins";

/**
 * Salin font subtitle dari public/fonts ke workDir/fonts agar bisa dibaca
 * libass/FFmpeg via filesystem. Mengembalikan { fontsdir, ok }.
 * Jika Quicksand tidak ada → jatuh ke Poppins; jika keduanya tak ada, ok=false.
 */
async function prepareSubtitleFonts(workDir: string): Promise<{ fontsdir: string; ok: boolean; fontName: string }> {
  const fontsDir = join(workDir, "fonts");
  try {
    await mkdir(fontsDir, { recursive: true });

    // Cari font Quicksand di public/fonts
    const quicksandCandidates = [
      "Quicksand_Book.otf",
      "Quicksand_Bold.otf",
      "Quicksand-Regular.ttf",
      "Quicksand.otf",
    ];
    const poppinsCandidates = [
      "Poppins-Regular.ttf",
      "Poppins-SemiBold.ttf",
      "Poppins-Medium.ttf",
      "Poppins-Bold.ttf",
    ];
    const baseDir = join(process.cwd(), "public", "fonts");

    const pick = async (cands: string[]): Promise<string | null> => {
      for (const c of cands) {
        const src = join(baseDir, c);
        if (existsSync(src)) {
          await copyFile(src, join(fontsDir, c));
          return c;
        }
      }
      return null;
    };

    const quicksand = await pick(quicksandCandidates);
    if (quicksand) return { fontsdir: fontsDir, ok: true, fontName: SUBTITLE_FONT_NAME };

    const poppins = await pick(poppinsCandidates);
    if (poppins) return { fontsdir: fontsDir, ok: true, fontName: SUBTITLE_FONT_FALLBACK };

    return { fontsdir: fontsDir, ok: false, fontName: SUBTITLE_FONT_NAME };
  } catch (e) {
    console.warn("[Video] prepareSubtitleFonts gagal:", (e as Error)?.message);
    return { fontsdir: fontsDir, ok: false, fontName: SUBTITLE_FONT_NAME };
  }
}

async function fetchPexelsBackground(query: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error("PEXELS_API_KEY tidak tersedia di .env");

  const res = await fetch(`${PEXELS_API_URL}?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) throw new Error(`Pexels API error (${res.status})`);

  const json = await res.json();
  const video = json.videos?.[0];
  if (!video) throw new Error("Tidak ada video Pexels ditemukan");

  // Pilih file video dengan resolusi terbaik (portrait)
  const files = video.video_files || [];
  const best = files
    .filter((f: any) => f.width && f.height && f.height >= f.width) // portrait
    .sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
  return best?.link || files[0]?.link;
}

/** Bangun query pencarian Pexels dari satu scene (prioritas imagePrompt → heading → content). */
function buildSceneQuery(scene: any, fallbackGenre?: string): string {
  const raw =
    scene?.imagePrompt ||
    scene?.visualPrompt ||
    scene?.image_prompt ||
    scene?.heading ||
    scene?.content ||
    "";
  const cleaned = String(raw).replace(/\[.*?\]/g, "").replace(/\s+/g, " ").trim();
  // Ambil bagian deskriptif ringkas (max ~10 kata) agar query Pexels relevan.
  const words = cleaned ? cleaned.split(" ") : [];
  const q = words.length > 10 ? words.slice(0, 10).join(" ") : cleaned;
  if (q) return q;
  return fallbackGenre || "cinematic";
}

/** Ambil video unik per scene secara otomatis. Kembalikan [{ path, duration }]. */
async function fetchSceneVisuals(
  scenes: any[],
  workDir: string,
  fallbackGenre?: string
): Promise<{ path: string; duration: number; ok: boolean }[]> {
  const limited = scenes ? scenes.slice(0, 10) : [];
  if (limited.length === 0) return [];

  // Fetch paralel per scene (maks 10) agar cepat.
  const results = await Promise.all(
    limited.map(async (scene, i) => {
      const query = buildSceneQuery(scene, fallbackGenre);
      try {
        const url = await fetchPexelsBackground(query);
        const buf = await fetchBuffer(url);
        const path = join(workDir, `auto-scene-${i}.mp4`);
        await writeFile(path, buf);
        return { path, duration: 0, ok: true };
      } catch (e) {
        console.warn(`[Video] Gagal fetch visual scene ${i} (${query}):`, e);
        return { path: "", duration: 0, ok: false };
      }
    })
  );

  return results;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  // Data URI base64
  if (url.startsWith("data:")) {
    const base64 = url.split(",")[1];
    if (!base64) throw new Error("Data URI tidak valid");
    return Buffer.from(base64, "base64");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal fetch (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Dapatkan durasi audio (detik) via `ffmpeg -i input.mp3`.
 * ffmpeg-static tidak menyertakan ffprobe, jadi kita parse "Duration: HH:MM:SS.ss"
 * dari stderr ffmpeg (setara dengan ffprobe -show_entries format=duration).
 */
function getAudioDuration(ffmpegPath: string, audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ["-i", audioPath], { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", () => {
      // ffmpeg -i tanpa output akan exit non-zero, tapi tetap mencetak Duration di stderr.
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (match) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const s = parseFloat(match[3]);
        resolve(h * 3600 + m * 60 + s);
      } else {
        reject(new Error("Tidak dapat membaca durasi audio dari ffmpeg"));
      }
    });
  });
}

/** Parse "time=HH:MM:SS.ss" dari stderr FFmpeg → detik. Return null jika tidak cocok. */
function parseFfmpegTime(line: string): number | null {
  const match = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseFloat(match[3]);
  return h * 3600 + m * 60 + s;
}

export async function POST(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  // Identitas stable (device cookie) — dihitung di sini agar bisa diset di
  // response headers SSE di bawah.
  const identity = getServerIdentity(request);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected — ignore
        }
      };

      let workDir: string | undefined;

      try {
        const body = await request.json();
        const {
          audioUrl,
          subtitleUrl,
          projectId,
          genre,
          backgroundUrl: userBackgroundUrl,
          subtitleSegments,
          subtitleStyle,
          platform,
          // Timeline: footage per scene untuk concat (jika ada)
          sceneFootage,
          // Scene list dari script — untuk visual otomatis per-scene
          scenes,
        } = body;

        if (!audioUrl || !subtitleUrl || !projectId) {
          send({ status: "error", message: "Field audioUrl, subtitleUrl, dan projectId wajib diisi" });
          controller.close();
          return;
        }

        // ===== CREDIT CHECK (guard only — credit already decremented at generate-script) =====
        const hasCredit = await checkCredits(identity.identityKey);
        if (!hasCredit) {
          send({ status: "error", statusCode: 402, message: "Kredit kamu habis! Upgrade untuk melanjutkan." });
          controller.close();
          return;
        }

        // 1. Fetch background visual
        //    Prioritas: user-selected footage (backgroundUrl) → recommended (random dari Pexels) → error
        const backgroundUrl = userBackgroundUrl || (await fetchPexelsBackground(genre || "cinematic"));

        // 2. Bangun SRT dari subtitleSegments (SOURCE OF TRUTH) — artifact sementara untuk FFmpeg.
        //    Jika segments tersedia, pakai itu. Jika tidak, fallback ke subtitleUrl (backward compat).
        let subtitleData: Buffer;
        if (Array.isArray(subtitleSegments) && subtitleSegments.length > 0) {
          const srt = buildSrtFromSegments(subtitleSegments, subtitleStyle);
          subtitleData = Buffer.from(srt, "utf-8");
          console.log(`[Video] Subtitle dari segments (${subtitleSegments.length} segmen)`);
        } else {
          subtitleData = await fetchBuffer(subtitleUrl);
          console.log(`[Video] Subtitle fallback ke subtitleUrl`);
        }

        // 2b. Fetch audio + background
        const [audioData, bgData] = await Promise.all([
          fetchBuffer(audioUrl),
          fetchBuffer(backgroundUrl),
        ]);

        // 3. FFmpeg native compose via ffmpeg-static
        const ffmpegPath = resolveFfmpegPath();
        if (!ffmpegPath || typeof ffmpegPath !== "string" || !existsSync(ffmpegPath)) {
          console.error(`[Video] FFmpeg binary tidak ditemukan. resolved=${ffmpegPath || "(kosong)"} exists=${ffmpegPath ? existsSync(ffmpegPath) : false}`);
          throw new Error("ffmpeg-static binary tidak ditemukan");
        }
        console.log(`[Video] FFmpeg resolved: ${ffmpegPath} | exists: ${existsSync(ffmpegPath)}`);

        // Buat direktori kerja sementara
        workDir = await mkdtemp(join(tmpdir(), "acs-video-"));
        const inputVideo = join(workDir, "input.mp4");
        const inputAudio = join(workDir, "input.mp3");
        const subtitleFile = join(workDir, "subtitle.srt");
        const outputFile = join(workDir, "output.mp4");

        // Salin font subtitle (Quicksand, fallback Poppins) → workDir/fonts
        const subtitleFont = await prepareSubtitleFonts(workDir);
        const subtitleFontDir = subtitleFont.ok ? subtitleFont.fontsdir : "";
        const fontName = subtitleFont.fontName;

        await writeFile(inputVideo, bgData);
        await writeFile(inputAudio, audioData);
        await writeFile(subtitleFile, subtitleData);

        // 3a. Dapatkan durasi audio untuk kalkulasi persen progress
        const totalDuration = await getAudioDuration(ffmpegPath, inputAudio);
        console.log(`[Video] Audio duration: ${totalDuration}s`);

        // Resolusi output mengikuti platform (TikTok/Reels → 9:16, YouTube → 16:9).
        const isHorizontal = platform === "youtube";
        const outW = isHorizontal ? 1920 : 1080;
        const outH = isHorizontal ? 1080 : 1920;
        const outRes = `${outW}x${outH}`;

        // ===== SUBTITLE STYLE — ukuran proporsional per format (ala TikTok/Reels/YouTube).
        // Font lebih kecil agar caption tidak menutupi layar & tidak terpotong:
        // portrait 9:16 (TikTok/Reels) ≈ 2.5% tinggi, landscape 16:9 ≈ 3.7%, square ≈ 3.2%.
        const ratio = outW === outH ? 0.032 : outW > outH ? 0.037 : 0.025;
        const fontSize = Math.min(56, Math.max(24, Math.round(outH * ratio)));

        // Posisi: 2 = bottom-center, 8 = top-center (ASS).
        const alignment = subtitleStyle?.position === "top" ? 8 : 2;
        // Warna teks: dari style bila ada (fallback putih).
        const PrimaryColour = subtitleStyle?.color
          ? hexToAssColor(subtitleStyle.color)
          : "&H00FFFFFF";
        // Outline hitam tipis (style-strokeWidth fallback 3) + shadow hitam tebal.
        const outlineW = typeof subtitleStyle?.strokeWidth === "number" ? subtitleStyle.strokeWidth : 3;
        const strokeWidth = Math.min(6, Math.max(0, Math.round(outlineW)));
        const strokeColorHex = "000000";

        // Margin kiri/kanan persisten (8% lebar) → teks tidak pernah menyentuh tepi.
        const sideMargin = Math.round(outW * 0.08);

        // Gabungkan style — font Quicksand (fallback Poppins),
        // warna (dari preferensi/putih), outline tipis + shadow tebal, tanpa box.
        const forceStyle = [
          `FontName=${fontName}`,
          `FontSize=${fontSize}`,
          `PrimaryColour=${PrimaryColour}`,
          `Outline=${strokeWidth},OutlineColour=&H00${strokeColorHex}`,
          "Shadow=2,ShadowColour=&H99000000",
          "BorderStyle=1",
          `Alignment=${alignment}`,
          `MarginL=${sideMargin},MarginR=${sideMargin}`,
          "MarginV=" + Math.round(outH * 0.06),
        ].join(",");

        // Escape path SRT untuk filtergraph FFmpeg (Windows: `C:\` dan `\` harus di-escape).
        const escapedSubtitlePath = escapeFilterPath(subtitleFile);

        // Filter subtitles + optional fontsdir (biar libass tahu path font Quicksand/Poppins).
        // Tanpa kutip tunggal: kita pakai spawn (bukan shell), jadi quote malah jadi literal
        // yang bisa memecah parser filter FFmpeg.
        const fontsDirOpt = subtitleFontDir
          ? ":fontsdir=" + escapeFilterPath(subtitleFontDir)
          : "";
        const subtitleFilter = `[base]subtitles=${escapedSubtitlePath}${fontsDirOpt}:force_style='${forceStyle}'[vout]`;
        // Versi untuk -vf (single clip, tanpa [base]).
        const singleSubtitleFilter = `subtitles=${escapedSubtitlePath}${fontsDirOpt}:force_style='${forceStyle}'`;

        // ===== TIMELINE: jika ada sceneFootage, render per-scene (concat) =====
        const hasSceneFootage = Array.isArray(sceneFootage) && sceneFootage.length > 0;

        // Filter scale+pad untuk semua cabang (single clip & concat).
        // Rasio mengikuti platform tujuan (TikTok/Reels → 9:16, YouTube → 16:9).
        const scalePad = `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2`;

        let args: string[];

        // ===== OTOMATIS PER-SCENE: bila tidak ada sceneFootage manual & ada data scene,
        // pecah visual jadi video unik per scene mengikuti durasi total audio.
        let autoSceneClipped: { path: string; duration: number; ok: boolean }[] | null = null;
        if (!hasSceneFootage && Array.isArray(scenes) && scenes.length > 0) {
          autoSceneClipped = await fetchSceneVisuals(scenes, workDir, genre);
          const valid = autoSceneClipped.filter((s) => s.ok);
          console.log(`[Video] Auto per-scene: ${valid.length}/${scenes.length} scene visual dipakai`);
          // Jika tidak ada yang valid, fallback ke single-clip (biarkan null).
          if (valid.length === 0) autoSceneClipped = null;
        }

        if (autoSceneClipped && autoSceneClipped.length > 0) {
          // Durasi per scene dibagi rata dari total audio.
          const visible = autoSceneClipped.filter((s) => s.ok);
          const perSceneDur = totalDuration / visible.length;
          const sceneInputs = visible.map((s) => ({ path: s.path, duration: perSceneDur }));

          // Bangun filter_complex: scale+pad+trim tiap scene → concat → subtitles
          const parts: string[] = [];
          const concatInputs: string[] = [];
          for (let i = 0; i < sceneInputs.length; i++) {
            const dur = sceneInputs[i].duration;
            parts.push(
              `[${i}:v]${scalePad},trim=duration=${dur},setpts=PTS-STARTPTS[v${i}]`
            );
            concatInputs.push(`[v${i}]`);
          }
          const filterComplex =
            parts.join(";") +
            `;${concatInputs.join("")}concat=n=${sceneInputs.length}:v=1:a=0[base];` +
            subtitleFilter;

          args = [
            ...sceneInputs.map((s) => ["-stream_loop", "-1", "-i", s.path]).flat(),
            "-i", inputAudio,
            "-filter_complex", filterComplex,
            "-map", "[vout]",
            "-map", `${sceneInputs.length}:a`,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-c:a", "aac",
            "-shortest",
            "-t", String(totalDuration),
            "-movflags", "+faststart",
            "-y",
            outputFile,
          ];
          console.log(`[Video] Render auto per-scene (concat ${sceneInputs.length} clips)`);
        } else if (hasSceneFootage) {
          // Fetch + tulis tiap footage scene ke file terpisah
          const sceneInputs: { path: string; duration: number }[] = [];
          for (let i = 0; i < sceneFootage.length; i++) {
            const sf = sceneFootage[i];
            if (!sf?.videoUrl) continue;
            const buf = await fetchBuffer(sf.videoUrl);
            const path = join(workDir, `scene-${i}.mp4`);
            await writeFile(path, buf);
            sceneInputs.push({ path, duration: Number(sf.duration) || 0 });
          }

          if (sceneInputs.length === 0) {
            throw new Error("sceneFootage diberikan tapi tidak ada video valid");
          }

          // Bangun filter_complex: scale+pad+trim tiap scene → concat → subtitles
          const parts: string[] = [];
          const concatInputs: string[] = [];
          for (let i = 0; i < sceneInputs.length; i++) {
            const dur = sceneInputs[i].duration > 0 ? sceneInputs[i].duration : 5;
            parts.push(
              `[${i}:v]${scalePad},trim=duration=${dur},setpts=PTS-STARTPTS[v${i}]`
            );
            concatInputs.push(`[v${i}]`);
          }
          const filterComplex =
            parts.join(";") +
            `;${concatInputs.join("")}concat=n=${sceneInputs.length}:v=1:a=0[base];` +
            subtitleFilter;

          // Input: stream_loop -1 per scene + audio
          args = [
            ...sceneInputs.flatMap((s) => ["-stream_loop", "-1", "-i", s.path]),
            "-i", inputAudio,
            "-filter_complex", filterComplex,
            "-map", "[vout]",
            "-map", `${sceneInputs.length}:a`,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-c:a", "aac",
            "-shortest",
            // Batasi output tepat di durasi audio — konsisten dengan cabang
            // single-clip. `-shortest` dengan footage ter-loop bisa berhenti
            // di durasi footage yang lebih pendek; `-t` menjamin panjang audio.
            "-t", String(totalDuration),
            // faststart menaruh metadata (moov) di awal file → browser bisa
            // baca durasi & seek langsung tanpa men-download seluruh MP4.
            "-movflags", "+faststart",
            "-y",
            outputFile,
          ];

          console.log(`[Video] Render per-scene (concat ${sceneInputs.length} clips)`);
        } else {
          // ===== SINGLE CLIP: loop footage penuh =====
          args = [
            "-stream_loop", "-1",
            "-i", inputVideo,
            "-i", inputAudio,
            "-vf", `${scalePad},${singleSubtitleFilter}`,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-c:a", "aac",
            "-shortest",
            // Batasi output tepat di durasi audio. `-shortest` tidak bisa
            // diandalkan untuk menghentikan input yang di-loop tak terbatas
            // (-stream_loop -1) — tanpa ini render bisa mengamuk jadi
            // puluhan menit / ratusan MB.
            "-t", String(totalDuration),
            // faststart menaruh metadata (moov) di awal file → browser bisa
            // baca durasi & seek langsung tanpa men-download seluruh MP4.
            "-movflags", "+faststart",
            "-y",
            outputFile,
          ];
        }

        // 3b. Jalankan FFmpeg via spawn, stream progress via SSE
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(ffmpegPath, args, { windowsHide: true });

          let fullErr = "";
          proc.stderr.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            fullErr += text;
            // ===== TRACING SEMENTARA — tail stderr FFmpeg =====
            console.log("[Video stderr]", text.slice(-100));
            const time = parseFfmpegTime(text);
            if (time !== null && totalDuration > 0) {
              const percent = Math.min(100, Math.round((time / totalDuration) * 100));
              send({ percent });
            }
          });

          proc.on("error", (err) => {
            console.error("[Video] FFmpeg spawn error:", err);
            reject(err);
          });

          proc.on("close", (code) => {
            // ===== TRACING SEMENTARA — verifikasi exit code FFmpeg =====
            console.log("[Video] FFmpeg exit code:", code);
            if (code === 0) {
              resolve();
            } else {
              // ===== TRACING — cetak FULL stderr saat gagal =====
              console.error(`[Video] FFmpeg gagal (exit ${code})`);
              console.error("[Video stderr full]:\n" + fullErr);
              reject(new Error(`FFmpeg render gagal (exit ${code})`));
            }
          });
        });

        send({ percent: 100 });

        // ===== PASCA-RENDER: beri tahu klien bahwa FFmpeg selesai,
        // sekarang masuk tahap upload ke storage. Tanpa ini UI tampak
        // "beku di 100%" selama upload berjalan.
        send({ status: "uploading", message: "Mengunggah video ke cloud..." });

        const outputBuffer = await readFile(outputFile);

        // 4. Upload ke Cloudflare R2 (bukan Supabase Storage).
        //    Cek plan user → tentukan prefix folder:
        //    - free    → "free/"    (lifecycle R2 hapus setelah 24 jam)
        //    - premium → "premium/" (permanen, tanpa lifecycle rule)
        console.time("[Video] getUsage");
        const usage = await getUsage(identity.identityKey);
        console.timeEnd("[Video] getUsage");
        const plan = usage.plan;
        const isFree = plan === "free";
        const prefix = isFree ? "free/" : "premium/";
        const key = `${prefix}${identity.identityKey}/${Date.now()}.mp4`;

        let videoUrl: string;
        try {
          console.time("[Video] uploadToR2");
          videoUrl = await uploadToR2(outputBuffer, key, "video/mp4");
          console.timeEnd("[Video] uploadToR2");
        } catch (uploadError) {
          console.error("[video] R2 upload error:", uploadError);
          send({ status: "error", message: "Gagal upload video ke storage" });
          controller.close();
          return;
        }

        const videoStoragePlan: "free" | "premium" = isFree ? "free" : "premium";
        const videoExpiresAt: Date | null = isFree
          ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          : null;

        // 5. Update kolom video di tabel projects
        const supabase = createServiceRoleClient();
        const { error: updateError } = await supabase
          .from("projects")
          .update({
            video_url: videoUrl,
            video_storage_plan: videoStoragePlan,
            video_expires_at: videoExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", projectId);

        if (updateError) {
          console.warn("[video] Update projects error:", updateError);
        }

        // ===== TRACING SEMENTARA — verifikasi send done event =====
        console.log("[Video] Sending done event, videoUrl:", videoUrl);
        send({ status: "done", videoUrl, format: "mp4", resolution: outRes });
        controller.close();
      } catch (error) {
        console.error("[generate-video] Error:", error);
        send({ status: "error", message: error instanceof Error ? error.message : "Internal server error" });
        controller.close();
      } finally {
        // Bersihkan direktori kerja sementara
        if (workDir) {
          try {
            await rm(workDir, { recursive: true, force: true });
          } catch {
            // ignore cleanup error
          }
        }
      }
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
  if (identity.isNew) {
    headers["Set-Cookie"] = buildDeviceCookieHeader(identity.deviceId);
  }

  return new Response(stream, { headers });
}