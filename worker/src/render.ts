/**
 * Video render engine — worker
 * Ekstraksi logika render dari src/app/api/generate-video/route.ts.
 * Tidak bergantung Next.js - murni Node.js + FFmpeg.
 *
 * Fungsi utama: renderVideo(jobData, onProgress) -> { videoUrl, resolution, ... }
 * onProgress(percent) dipanggil saat FFmpeg melaporkan progress.
 */

import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm, mkdir, copyFile } from "fs/promises";
import { existsSync, readdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";

import { uploadToR2 } from "./lib/r2";
import { resolveMediaUrl } from "./lib/signed-storage-url";
import { computeSubtitleStyle, buildForceStyle } from "./lib/subtitle-style";
import { isValidAudioBuffer } from "./lib/audio-validation";
import { getUsage } from "./lib/usage";
import { getServiceRoleClient } from "./lib/supabase";
import { validatePublicUrl } from "./lib/public-url";
import type { RenderJobData, SubtitleSegment, Scene } from "./queue";

const PEXELS_API_URL = "https://api.pexels.com/videos/search";
const BIN = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const SUBTITLE_FONT_NAME = "Quicksand";
const SUBTITLE_FONT_FALLBACK = "Poppins";

export interface RenderResult {
  videoUrl: string;
  resolution: string;
  format: "mp4";
  storagePlan: "free" | "premium";
  expiresAt: string | null;
}

export type ProgressCallback = (percent: number) => void;

function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_BIN && existsSync(process.env.FFMPEG_BIN)) {
    return process.env.FFMPEG_BIN;
  }
  try {
    const modulePath = require.resolve("ffmpeg-static");
    const candidate = join(dirname(modulePath), BIN);
    if (existsSync(candidate)) return candidate;
  } catch { /* ignore */ }
  const fallback = join(process.cwd(), "node_modules", "ffmpeg-static", BIN);
  if (existsSync(fallback)) return fallback;
  try {
    const dir = join(process.cwd(), "node_modules", "ffmpeg-static");
    if (existsSync(dir)) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isFile() && (entry === BIN || entry === 'ffmpeg' || entry === 'ffmpeg.exe')) {
          return full;
        }
      }
    }
  } catch { /* ignore */ }
  return "";
}

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0') + ':' + s
    .toString().padStart(2, '0') + ',' + ms.toString().padStart(3, '0');
}

function splitSegmentIntoCues(segment: { start: number; end: number; text: string }) {
  const words = segment.text.split(/\s+/).filter(Boolean);
  if (words.length <= 3) return [{ start: segment.start, end: segment.end, text: words.join(' ') }];
  const duration = segment.end - segment.start;
  const cues = [];
  let cueStart = segment.start;
  for (let i = 0; i < words.length; i += 3) {
    const chunk = words.slice(i, i + 3);
    const chunkDuration = (chunk.length / words.length) * duration;
    const cueEnd = cueStart + chunkDuration;
    cues.push({ start: cueStart, end: cueEnd, text: chunk.join(' ') });
    cueStart = cueEnd;
  }
  return cues;
}

function buildSrtFromSegments(segments: SubtitleSegment[]) {
  return segments
    .flatMap((seg) => {
      const start = seg.startTime ?? seg.start;
      const end = seg.endTime ?? seg.end;
      const text = (seg.text || '').trim();
      if (typeof start !== 'number' || typeof end !== 'number' || end <= start || !text) return [];
      return splitSegmentIntoCues({ start, end, text });
    })
    .map((cue, i) => (i + 1) + '\n' + formatSrtTime(cue.start) + ' --> ' + formatSrtTime(cue.end) + '\n' + cue.text)
    .join('\n\n');
}

async function prepareSubtitleFonts(workDir: string): Promise<{ fontsdir: string; ok: boolean; fontName: string; fontFile: string }> {
  const fontsDir = join(workDir, 'fonts');
  try {
    await mkdir(fontsDir, { recursive: true });
    const quicksandCandidates = [
      'Quicksand_Book.otf',
      'Quicksand_Bold.otf',
      'Quicksand-Regular.ttf',
      'Quicksand.otf',
    ];
    const poppinsCandidates = [
      'Poppins-Regular.ttf',
      'Poppins-SemiBold.ttf',
      'Poppins-Medium.ttf',
      'Poppins-Bold.ttf',
    ];
    const baseDir = join(process.cwd(), 'public', 'fonts');
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
    if (quicksand) return { fontsdir: fontsDir, ok: true, fontName: SUBTITLE_FONT_NAME, fontFile: join(fontsDir, quicksand) };
    const poppins = await pick(poppinsCandidates);
    if (poppins) return { fontsdir: fontsDir, ok: true, fontName: SUBTITLE_FONT_FALLBACK, fontFile: join(fontsDir, poppins) };
    return { fontsdir: fontsDir, ok: false, fontName: SUBTITLE_FONT_NAME, fontFile: '' };
  } catch (e) {
    console.warn('[render] prepareSubtitleFonts g:', e instanceof Error ? e.message : e);
    return { fontsdir: fontsDir, ok: false, fontName: SUBTITLE_FONT_NAME, fontFile: '' };
  }
}

async function fetchPexelsBackground(query: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('PEXELS_API_KEY tidak tersedia di .env');
  const res = await fetch(
    PEXELS_API_URL + '?query=' + encodeURIComponent(query) + '&per_page=1&orientation=portrait',
    { headers: { Authorization: apiKey } }
  );
  if (!res.ok) throw new Error('Pexels API error (' + res.status + ')');
  const json: any = await res.json();
  const video = json.videos && json.videos[0];
  if (!video) throw new Error('Tidak ada video Pexels ditemukan');
  const files = video.video_files || [];
  const best = files
    .filter((f: any) => f.width && f.height && f.height >= f.width)
    .sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
  return best ? best.link : (files[0] ? files[0].link : '');
}

function buildSceneQuery(scene: Scene | null | undefined, fallbackGenre?: string): string {
  const raw = scene && (scene.imagePrompt || scene.visualPrompt || scene.image_prompt || scene.heading || scene.content) || '';
  const cleaned = String(raw).replace(/\[.*?\]/g, '').replace(/\+/g, ' ').trim();
  const words = cleaned ? cleaned.split(' ') : [];
  const q = words.length > 10 ? words.slice(0, 10).join(' ') : cleaned;
  return q || fallbackGenre || 'cinematic';
}

async function fetchSceneVisuals(scenes: Scene[] | undefined, workDir: string, fallbackGenre?: string): Promise<Array<{ path: string; duration: number; ok: boolean }>> {
  const limited = scenes ? scenes.slice(0, 10) : [];
  if (limited.length === 0) return [];
  const results = await Promise.all(
    limited.map(async (scene, i) => {
      const query = buildSceneQuery(scene, fallbackGenre);
      try {
        const url = await fetchPexelsBackground(query);
        const buf = await fetchBuffer(url);
        const fpath = join(workDir, 'auto-scene-' + i + '.mp4');
        await writeFile(fpath, buf);
        return { path: fpath, duration: 0, ok: true };
      } catch (e) {
        console.warn('[render] Gagal fetch visual scene ' + i + ' (' + query + '):', e);
        return { path: '', duration: 0, ok: false };
      }
    })
  );
  return results;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  // SSRF guard — satu choke point yang melindungi SEMUA call site fetchBuffer
  // di file ini (tolak non-https, data URI, dan IP private).
  validatePublicUrl(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gagal fetch (' + res.status + ')');
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function getAudioDuration(ffmpegPath: string, audioPath: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-i', audioPath], { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (match) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const s = parseFloat(match[3]);
        resolve(h * 3600 + m * 60 + s);
      } else {
        reject(new Error('Tidak dapat membaca durasi audio dari ffmpeg'));
      }
    });
  });
}

function parseFfmpegTime(line: string): number | null {
  const match = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseFloat(match[3]);
  return h * 3600 + m * 60 + s;
}

// ============================================================
// MAIN: renderVideo
// ============================================================
export async function renderVideo(jobData: RenderJobData, onProgress: ProgressCallback): Promise<RenderResult> {
  const {
    audioUrl, subtitleUrl, subtitleSegments, subtitleStyle,
    projectId, identityKey, userId, genre,
    backgroundUrl: userBackgroundUrl,
    sceneFootage, scenes, platform,
  } = jobData;
  if (!audioUrl || !subtitleUrl || !projectId) {
    throw new Error('Field audioUrl, subtitleUrl, dan projectId wajib diisi');
  }
  let workDir;
  try {
    const resolvedAudioUrl = (await resolveMediaUrl('acs-audio', audioUrl)) || audioUrl;
    const resolvedSubtitleUrl = (await resolveMediaUrl('acs-subtitles', subtitleUrl)) || subtitleUrl;
    const backgroundUrl = userBackgroundUrl || (await fetchPexelsBackground(genre || 'cinematic'));
    let subtitleData;
    if (Array.isArray(subtitleSegments) && subtitleSegments.length > 0) {
      const srt = buildSrtFromSegments(subtitleSegments);
      subtitleData = Buffer.from(srt, 'utf-8');
      console.log('[render] Subtitle dari segments (' + subtitleSegments.length + ' segmen)');
    } else {
      subtitleData = await fetchBuffer(resolvedSubtitleUrl);
      console.log('[render] Subtitle fallback ke subtitleUrl');
    }
    const [audioData, bgData] = await Promise.all([fetchBuffer(resolvedAudioUrl), fetchBuffer(backgroundUrl)]);
    if (!isValidAudioBuffer(audioData)) {
      throw new Error('Audio file tidak valid (bukan MP3/WAV/OGG). Regenerate audio atau coba lagi.');
    }
    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath || !existsSync(ffmpegPath)) {
      throw new Error('ffmpeg-static binary tidak ditemukan');
    }
    console.log('[render] FFmpeg resolved: ' + ffmpegPath);
    workDir = await mkdtemp(join(tmpdir(), 'acs-video-'));
    const inputVideo = join(workDir, 'input.mp4');
    const inputAudio = join(workDir, 'input.mp3');
    const subtitleFile = join(workDir, 'subtitle.srt');
    const outputFile = join(workDir, 'output.mp4');
    const subtitleFont = await prepareSubtitleFonts(workDir);
    const usage = await getUsage(identityKey, userId);
    const isFree = usage.plan === 'free';
    const subtitleFontDir = subtitleFont.ok ? subtitleFont.fontsdir : '';
    const fontName = subtitleFont.fontName;
    await writeFile(inputVideo, bgData);
    await writeFile(inputAudio, audioData);
    await writeFile(subtitleFile, subtitleData);
    const totalDuration = await getAudioDuration(ffmpegPath, inputAudio);
    console.log('[render] Audio duration: ' + totalDuration + 's');
    const isHorizontal = platform === 'youtube';
    const outW = isHorizontal ? 1920 : 1080;
    const outH = isHorizontal ? 1080 : 1920;
    const outRes = outW + 'x' + outH;
    const assStyle = computeSubtitleStyle({ style: subtitleStyle, outW, outH, platform, resolvedFont: fontName });
    const forceStyle = buildForceStyle(assStyle);
    const escapedSubtitlePath = escapeFilterPath(subtitleFile);
    const fontsDirOpt = subtitleFontDir ? ':fontsdir=' + escapeFilterPath(subtitleFontDir) : '';
    const subtitleFilter = `[base]subtitles=${escapedSubtitlePath}${fontsDirOpt}:force_style='${forceStyle}'[vout]`;
    // Versi untuk -vf (single clip, tanpa [base]).
    const singleSubtitleFilter = `subtitles=${escapedSubtitlePath}${fontsDirOpt}:force_style='${forceStyle}'`;

    // ===== WATERMARK (free plan) — burn-in "Faza Studio" bottom-right =====
    // Pricing janji: free plan punya "Watermark Faza Studio" (constants.ts).
    // Premium (starter/pro) TIDAK punya watermark. Di-skip jika fontfile tidak tersedia.
    const watermarkDraw =
      isFree && subtitleFont.fontFile
        ? ",drawtext=fontfile=" +
          escapeFilterPath(subtitleFont.fontFile) +
          ":text='Faza Studio':x=w-tw-20:y=h-th-16:fontsize=16:" +
          "fontcolor=white@0.7:borderw=1:bordercolor=black@0.6"
        : "";

    const subtitleFilterWm = subtitleFilter.replace(/\[vout\]$/, watermarkDraw + "[vout]");
    const singleSubtitleFilterWm = singleSubtitleFilter + watermarkDraw;
    const hasSceneFootage = Array.isArray(sceneFootage) && sceneFootage.length > 0;
    const scalePad = 'scale=' + outW + ':' + outH + ':force_original_aspect_ratio=decrease,pad=' + outW + ':' + outH + ':(ow-iw)/2:(oh-ih)/2';
    let autoSceneClipped: Array<{ path: string; duration: number; ok: boolean }> | null = null;
    if (!hasSceneFootage && Array.isArray(scenes) && scenes.length > 0) {
      autoSceneClipped = await fetchSceneVisuals(scenes, workDir, genre);
      const valid = autoSceneClipped.filter((s) => s.ok);
      console.log('[render] Auto per-scene: ' + valid.length + '/' + scenes.length + ' scene visual dipakai');
      if (valid.length === 0) autoSceneClipped = null;
    }
    let args: string[];
    if (autoSceneClipped && autoSceneClipped.length > 0) {
      const visible = autoSceneClipped.filter((s) => s.ok);
      const perSceneDur = totalDuration / visible.length;
      const sceneInputs = visible.map((s) => ({ path: s.path, duration: perSceneDur }));
      const parts = [];
      const concatInputs = [];
      for (let i = 0; i < sceneInputs.length; i++) {
        const dur = sceneInputs[i].duration;
        parts.push('[' + i + ':v]' + scalePad + ',trim=duration=' + dur + ',setpts=PTS-STARTPTS[v' + i + ']');
        concatInputs.push('[v' + i + ']');
      }
      const filterComplex = parts.join(';') + ';' + concatInputs.join('') + 'concat=n=' + sceneInputs.length + ':v=1:a=0[base];' + subtitleFilterWm;
      args = [];
      for (const s of sceneInputs) { args.push('-stream_loop', '-1', '-i', s.path); }
      args.push('-i', inputAudio, '-filter_complex', filterComplex, '-map', '[vout]', '-map', String(sceneInputs.length) + ':a');
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-shortest', '-t', String(totalDuration), '-movflags', '+faststart', '-y', outputFile);
      console.log('[render] Render auto per-scene (concat ' + sceneInputs.length + ' clips)');
    } else if (hasSceneFootage) {
      const sceneInputs = [];
      for (let i = 0; i < sceneFootage.length; i++) {
        const sf = sceneFootage[i];
        if (!sf || !sf.videoUrl) continue;
        const buf = await fetchBuffer(sf.videoUrl);
        const fpath = join(workDir, 'scene-' + i + '.mp4');
        await writeFile(fpath, buf);
        sceneInputs.push({ path: fpath, duration: Number(sf.duration) || 0 });
      }
      if (sceneInputs.length === 0) throw new Error('sceneFootage diberikan tapi tidak ada video valid');
      const parts = [];
      const concatInputs = [];
      for (let i = 0; i < sceneInputs.length; i++) {
        const dur = sceneInputs[i].duration > 0 ? sceneInputs[i].duration : 5;
        parts.push('[' + i + ':v]' + scalePad + ',trim=duration=' + dur + ',setpts=PTS-STARTPTS[v' + i + ']');
        concatInputs.push('[v' + i + ']');
      }
      const filterComplex = parts.join(';') + ';' + concatInputs.join('') + 'concat=n=' + sceneInputs.length + ':v=1:a=0[base];' + subtitleFilterWm;
      args = [];
      for (const s of sceneInputs) { args.push('-stream_loop', '-1', '-i', s.path); }
      args.push('-i', inputAudio, '-filter_complex', filterComplex, '-map', '[vout]', '-map', String(sceneInputs.length) + ':a');
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-shortest', '-t', String(totalDuration), '-movflags', '+faststart', '-y', outputFile);
      console.log('[render] Render per-scene (concat ' + sceneInputs.length + ' clips)');
    } else {
      args = [
        '-stream_loop', '-1', '-i', inputVideo, '-i', inputAudio,
        '-vf', scalePad + ',' + singleSubtitleFilterWm,
        '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac',
        '-shortest', '-t', String(totalDuration), '-movflags', '+faststart', '-y', outputFile,
      ];
    }

    // 14. Spawn FFmpeg + progress
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, args, { windowsHide: true });
      let fullErr = '';
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        fullErr += text;
        const time = parseFfmpegTime(text);
        if (time !== null && totalDuration > 0) {
          const percent = Math.min(100, Math.round((time / totalDuration) * 100));
          onProgress(percent);
        }
      });
      proc.on('error', (err) => {
        console.error('[render] FFmpeg spawn error:', err);
        reject(err);
      });
      proc.on('close', (code) => {
        console.log('[render] FFmpeg exit code: ' + code);
        if (code === 0) { resolve(); }
        else {
          console.error('[render] FFmpeg gagal (exit ' + code + ')');
          console.error('[render] stderr:' + fullErr);
          reject(new Error('FFmpeg render gagal (exit ' + code + ')'));
        }
      });
    });
    onProgress(100);
    const outputBuffer = await readFile(outputFile);
    const prefix = isFree ? 'free/' : 'premium/';
    const key = prefix + identityKey + '/' + Date.now() + '.mp4';
    console.log('[render] Upload R2 key=' + key + ' size=' + outputBuffer.length);
    const videoUrl = await uploadToR2(outputBuffer, key, 'video/mp4');
    const storagePlan = isFree ? 'free' : 'premium';
    const expiresAt = isFree ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
    const supabase = getServiceRoleClient();
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        video_url: videoUrl,
        video_storage_plan: storagePlan,
        video_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);
    if (updateError) { console.warn('[render] Update projects error:', updateError); }
    console.log('[render] Selesai: ' + videoUrl);
    return { videoUrl, resolution: outRes, format: 'mp4', storagePlan, expiresAt };
  } catch (error) {
    console.error('[render] Error:', error);
    throw error;
  } finally {
    if (workDir) {
      try { await rm(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}
