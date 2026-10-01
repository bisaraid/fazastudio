"use client";

import { useState, useCallback, useRef } from "react";
import { useProjectStore } from "@/lib/store/projectStore";
import {
  PipelineStep,
  ScriptResult,
  AudioResult,
  SubtitleResult,
  VideoResult,
  WizardFormData,
  Genre,
} from "@/lib/types";
import { CategoryId } from "@/lib/categories/types";
import { DurationTier } from "@/lib/duration";
import { providerLabel } from "@/lib/constants";
import { decideWatchdog } from "@/lib/pipeline/video-watchdog";
import { planChainSteps } from "@/lib/pipeline/resume-action";
import { generateId, sleep } from "@/lib/utils";
import { track } from "@/lib/posthog";

/** Timeout default per langkah pipeline (ms). */
const FETCH_TIMEOUTS: Partial<Record<PipelineStep, number>> = {
  script: 90_000,
  audio: 120_000,
  subtitle: 60_000,
  video: 10 * 60_000,
  export: 30_000,
};

/**
 * fetch dengan timeout + abort signal — mencegah request yang menggantung
 * membuat spinner "beku". Jika timeout/abort, throw Error dengan pesan jelas.
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 90_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("Waktu request habis. Coba lagi.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fase 4B/5B: tempelkan `code` (+ waktu tunggu Retry-After) ke Error supaya UI
 * bisa bereaksi spesifik: 402 → upgrade, 429 → tombol disabled, 401 → gate daftar.
 */
function withErrorCode(
  err: Error,
  status: number,
  apiCode?: string | null,
  retryAfterHeader?: string | null
): Error {
  const code =
    apiCode ||
    (status === 402
      ? "CREDIT_EXHAUSTED"
      : status === 429
        ? "RATE_LIMITED"
        : status === 401
          ? "AUTH_REQUIRED"
          : "");
  const target = err as Error & { code?: string; retryAfterSeconds?: number };
  if (code) target.code = code;

  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds > 0) target.retryAfterSeconds = seconds;
  return err;
}

export interface PipelineProgress {
  currentStep: PipelineStep;
  progress: number; // 0-100 — hanya bermakna untuk video (data SSE riil)
  statusMessage: string;
  isRunning: boolean;
  error: string | null;
  /** D6: destination step yang sedang gagal — untuk retry di kartu + sticky bar. */
  errorStep: PipelineStep | null;
  /** D7: pesan error subtitle (dependency internal audio → video). */
  subtitleError: string | null;
  /** Fase 4B: kode error API (mis. "CREDIT_EXHAUSTED" untuk 402) → menentukan aksi lanjutan. */
  errorCode?: string | null;
  /** Fase 4B: server memakai ulang job render yang masih hidup (bukan render baru). */
  videoJobActive?: boolean;
  /** 5B: sisa detik dari header Retry-After (untuk pesan "coba lagi dalam …"). */
  retryAfterSeconds?: number | null;
  /** 5D: endpoint mahal menolak anon (401) → halaman membuka gate daftar. */
  requiresAuth?: boolean;
  /** D8: step berjalan >20 dtk → UI menampilkan "jangan tutup halaman". */
  slow?: boolean;
  limitProject?: { id?: string; title?: string | null } | null;
}

export interface AudioOptions {
  provider?: "google" | "elevenlabs" | "cartesia";
  // Google TTS
  lang?: "id" | "en";
  tld?: string;
  slow?: boolean;
  // Cartesia
  voice_id?: string; // "" | "andi" | "siti"
  speed?: number;
  emotion?: string;
  // ElevenLabs
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  preview?: boolean;
}

const STEP_MESSAGES: Record<PipelineStep, string> = {
  script: "Menulis script...",
  audio: "Membuat audio...",
  subtitle: "Sinkronisasi subtitle...",
  video: "Merender video...",
  export: "Menyiapkan hasil akhir...",
};

/**
 * D8: ambang "proses lama". Setelah ini UI menampilkan
 * "Masih diproses, jangan tutup halaman." Think-steps berbasis timer dihapus —
 * progres hanya berupa status nyata + bar indeterminate.
 */
const SLOW_STEP_MS = 20_000;

/**
 * Mapping Genre ACS → CategoryId engine (1:1 karena sudah disamakan)
 */
function mapGenreToCategory(genre: Genre): CategoryId {
  // Genre ACS sekarang identik dengan CategoryId engine
  // "horor" → "horror", sisanya sama persis
  if (genre === "horor") return "horror";
  return genre as CategoryId;
}

/**
 * Mapping targetDuration (detik) → DurationTier
 */
function mapDurationToTier(targetDuration: number): DurationTier {
  if (targetDuration <= 60) return "short";
  if (targetDuration <= 300) return "standard";
  return "long";
}

export function usePipeline() {
  const [progress, setProgress] = useState<PipelineProgress>({
    currentStep: "script",
    progress: 0,
    statusMessage: "",
    isRunning: false,
    error: null,
    errorStep: null,
    subtitleError: null,
  });

  const store = useProjectStore();

  /**
   * REL-06: lock re-entrancy berbasis REF (bukan state).
   *
   * `isRunning` baru berubah setelah re-render, jadi dua klik cepat / klik +
   * Enter masih bisa lolos dua-duanya dan menembak 2 job render (CPU + kuota
   * harian dobel). Ref berubah sinkron → klik kedua langsung ditolak.
   */
  const busyRef = useRef(false);

  const generateSingleStep = useCallback(
    async (step: PipelineStep, projectId: string, audioOptions?: AudioOptions, subtitleAudioUrl?: string): Promise<boolean | string> => {
      // Baca dari currentProject (state terbaru), bukan projects.find (snapshot DB yang bisa stale).
      const project = useProjectStore.getState().currentProject;
      if (!project || project.id !== projectId) {
        console.error(`[Pipeline] Project tidak ditemukan di currentProject (id: ${projectId})`);
        return false;
      }

      store.updateProjectStep(step, "generating");

      setProgress((prev) => ({
        ...prev,
        currentStep: step,
        progress: 0,
        statusMessage: STEP_MESSAGES[step],
        error: null,
        // D6: mulai/retry step → bersihkan error step.
        errorStep: null,
        // Fase 4B: bersihkan kode error percobaan sebelumnya.
        errorCode: null,
        // D8: reset penanda "proses lama" untuk step baru.
        slow: false,
        // D7: mulai percobaan subtitle → sembunyikan error subtitle sebelumnya.
        ...(step === "subtitle" ? { subtitleError: null } : {}),
      }));

      // D8: tidak ada lagi nudge % palsu & think-steps berbasis timer. Yang
      // ditampilkan: statusMessage nyata + bar indeterminate, dan penanda
      // "proses lama" setelah SLOW_STEP_MS.
      let slowTimer: ReturnType<typeof setTimeout> | undefined;

      try {
        slowTimer = setTimeout(() => {
          setProgress((prev) => ({ ...prev, slow: true }));
        }, SLOW_STEP_MS);

        switch (step) {
          case "script": {
            const categoryId = mapGenreToCategory(project.genre);
            const duration = mapDurationToTier(project.targetDuration);

            // Panggil API route (server-side) — TIDAK import fungsi server langsung
            const res = await fetchWithTimeout("/api/generate-script", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topic: project.topic,
                categoryId,
                customGenre: project.customGenre,
                duration,
                targetDuration: project.targetDuration,
                usedClosingIds: project.metadata?.usedClosingIds ?? [],
                platform: project.platform,
                identityKey: `anon:${project.id}`,
                projectId,
              }),
            }, FETCH_TIMEOUTS.script);
            const json = await res.json();
            if (!json.success || !json.data) {
                          if (json) {
              if (json.code === "PROJECT_LIMIT") {
                let oldestTitle = "";
                setProgress((prev)=> ({ ...prev, limitProject: json.oldest }));
                if (json.oldest) {
                  if (json.oldest.title) oldestTitle = json.oldest.title;
                  else oldestTitle = json.oldest.id;
                }
                throw new Error("Batas project ber-isi tercapai. Hapus project terlama: "+ oldestTitle);
              }
            }
throw withErrorCode(new Error(json.error || "Generate script gagal"), res.status, json.code, res.headers.get("Retry-After"));
            }
            const script = json.data as ScriptResult;

            // Convert to ACS ScriptResult format
            const acsScript: ScriptResult = {
              id: script.id,
              title: script.title,
              scenes: script.scenes.map((s) => ({
                id: s.id,
                order: s.order,
                heading: s.heading,
                content: s.content,
                visualPrompt: s.visualPrompt,
                duration: s.duration,
                sceneMood: s.sceneMood,
                isConclusion: s.isConclusion,
              })),
              fullScript: script.fullScript,
              estimatedDuration: script.estimatedDuration,
              wordCount: script.wordCount,
            };

            store.setScriptResult(acsScript);
            store.updateProjectMetadata({ usedClosingIds: json.data.usedClosingIds ?? [] });
            track("script_generated", {
              niche: project.genre || "",
              platform: project.platform || "",
              durasi: project.targetDuration || 0,
              duration_tier: duration,
            });
            break;
          }
          case "audio": {
            if (!project.script) throw new Error("Script belum digenerate");
            const opts = audioOptions || {};
            // ACS Scene.content → narration untuk TTS
            const scenes = project.script.scenes.map((s: { content: string }) => ({
              narration: s.content,
            }));

            // Bangun settings object per provider
            const provider = opts.provider || "cartesia";
            let settings: unknown;
            if (provider === "cartesia") {
              settings = {
                voice_id: opts.voice_id || "",
                speed: opts.speed || 1.0,
                ...(opts.emotion ? { emotion: opts.emotion } : {}),
              };
            } else if (provider === "elevenlabs") {
              settings = {
                voice_id: "",
                stability: opts.stability ?? 0.5,
                similarity_boost: opts.similarity_boost ?? 0.75,
                style: opts.style ?? 0.5,
                use_speaker_boost: opts.use_speaker_boost ?? true,
                speed: opts.speed || 1.0,
              };
            } else {
              settings = {
                lang: opts.lang || "id",
                tld: opts.tld || "com",
                slow: opts.slow || false,
              };
            }

            const res = await fetchWithTimeout("/api/generate-tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                scenes,
                provider,
                settings,
                preview: opts.preview,
                projectId,
              }),
            }, FETCH_TIMEOUTS.audio);

            if (!res.ok) {
              let errorMsg = `TTS gagal (${res.status})`;
              let apiCode: string | null = null;
              try {
                const json = await res.json();
                if (json.error) errorMsg = json.error;
                if (json.code) apiCode = json.code;
              } catch {
                // ignore — response bukan JSON (mungkin error binary)
              }
              throw withErrorCode(new Error(errorMsg), res.status, apiCode, res.headers.get("Retry-After"));
            }

            // ===== PREVIEW: response binary audio/mpeg → Blob URL (hanya untuk browser) =====
            if (opts.preview) {
              const blob = await res.blob();
              return URL.createObjectURL(blob);
            }

            // ===== NON-PREVIEW: response JSON { audioUrl } dari Supabase Storage =====
            const json = await res.json();
            if (!json.success || !json.data?.audioUrl) {
              throw new Error(json.error || "TTS response tidak valid");
            }
            const audioUrl = json.data.audioUrl as string;
            const usedProvider = (json.data.provider as string) || provider;

            store.setAudioResult({
              id: generateId(),
              url: audioUrl,
              duration: project.script.estimatedDuration,
              voiceName: providerLabel(usedProvider),
              provider: usedProvider as "elevenlabs" | "cartesia" | "google",
              language: "id-ID",
              speed: opts.speed || 1.0,
              emotion: opts.emotion || "netral",
              fileSize: json.data.fileSize || 0,
            } as AudioResult);
            track("audio_generated", {
              provider: usedProvider || provider,
              durasi: project.script?.estimatedDuration || 0,
            });
            // ===== LOGGING VERIFIKASI (sementara) =====
            console.log(`[Pipeline] audio result URL: ${audioUrl}`);
            console.log(`[Pipeline] audio status: ${useProjectStore.getState().currentProject?.steps.audio}`);

            // ===== "Siap Posting" (judul/caption/hashtag) — TIDAK lagi di-generate di sini.
            // Di-generate LAZY oleh PostingCard setelah video selesai, dengan cache di
            // project.metadata.posting (di-invalidate saat script diregenerasi — 5A).
            // (Dulu: background fetch yang gagal diam-diam + setScriptResult yang justru
            //  memicu invalidateDownstream sehingga media hilir ikut terhapus.)
            break;
          }
          case "subtitle": {
            if (!project.script) throw new Error("Script belum digenerate");
            // Subtitle menerima audioUrl secara EKSPLISIT dari auto-chain,
            // bukan dari state yang berpotensi stale (race condition).
            const audioUrl = subtitleAudioUrl || project.audio?.url;
            if (!audioUrl) throw new Error("Audio URL belum tersedia untuk subtitle");
            console.log("[Pipeline] subtitle auto-chain start");
            console.log(`[Pipeline] subtitle audioUrl: ${audioUrl}`);
            const subRes = await fetchWithTimeout("/api/generate-subtitle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                audioUrl,
                projectId: project.id,
              }),
            }, FETCH_TIMEOUTS.subtitle);
            const subJson = await subRes.json();
            console.log("[Pipeline] subtitle response:", JSON.stringify(subJson));
            if (!subJson.success || !subJson.data) {
              throw new Error(subJson.error || "Subtitle gagal");
            }
            // Segments adalah SOURCE OF TRUTH — simpan dari response Groq Whisper.
            // entries dipertahankan untuk backward compat (bukan sumber timing).
            const rawSegments = Array.isArray(subJson.data.segments) ? subJson.data.segments : [];
            const segments = rawSegments.map((s: any, i: number) => ({
              id: s.id != null ? String(s.id) : `seg-${i}`,
              startTime: s.startTime ?? s.start ?? 0,
              endTime: s.endTime ?? s.end ?? 0,
              text: s.text || "",
            }));
            store.setSubtitleResult({
              id: subJson.data.id || generateId(),
              entries: segments.map((s: any) => ({
                id: s.id,
                startTime: s.startTime,
                endTime: s.endTime,
                text: s.text,
              })),
              segments,
              style: {
                fontSize: 28,
                color: "#FFD700",
                position: "bottom",
                strokeColor: "#000000",
                strokeWidth: 2,
              },
              srtContent: subJson.data.srtContent || "",
              vttContent: subJson.data.vttContent || subJson.data.srtContent || "",
              language: subJson.data.language || "id-ID",
              url: subJson.data.subtitleUrl,
            } as SubtitleResult);
            setProgress((prev) => ({ ...prev, subtitleError: null }));
            break;
          }
          case "video": {
            if (!project.audio || !project.subtitle)
              throw new Error("Audio dan Subtitle harus sudah selesai");

            // Footage state adalah sumber utama.
            // backgroundUrl di-derive dari footage yang dipilih user (project.footage).
            // Prioritas: user-selected → scene footage (jika ada) → recommended (fetch /api/footage) → random.
            let backgroundUrl: string | undefined;

            // 1. User-selected footage (project-level, MVP)
            if (project.footage?.videoUrl) {
              backgroundUrl = project.footage.videoUrl;
            }
            // 2. Scene-level footage (jika semua scene pakai footage yang sama / scene pertama)
            else {
              const firstSceneWithFootage = project.script?.scenes?.find((s) => s.footage?.videoUrl);
              if (firstSceneWithFootage?.footage?.videoUrl) {
                backgroundUrl = firstSceneWithFootage.footage.videoUrl;
              }
            }

            // 3. Recommended footage — coba ambil dari /api/footage dengan query visual scene/project
            if (!backgroundUrl) {
              try {
                const visualPrompt =
                  project.script?.scenes?.find((s) => s.visualPrompt)?.visualPrompt ||
                  project.topic;
                const footageRes = await fetchWithTimeout("/api/footage", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    query: visualPrompt,
                    genre: project.genre,
                    perPage: 3,
                  }),
                }, 15_000);
                const footageJson = await footageRes.json();
                if (footageJson.success && footageJson.data?.[0]?.videoUrl) {
                  backgroundUrl = footageJson.data[0].videoUrl;
                }
              } catch (e) {
                console.warn("[usePipeline] Footage recommendation gagal, fallback ke random:", e);
              }
            }

            // ===== LOGGING VERIFIKASI (sementara) — sebelum generate-video =====
            console.log(`[Pipeline] project audio before video: ${project.audio?.url}`);
            console.log(`[Pipeline] subtitle before video: ${project.subtitle?.url} | srt: ${project.subtitle?.srtContent?.slice(0, 50)}`);

            // ===== TIMELINE: footage per scene (dari scene.footage yang dipilih di TimelineEditor) =====
            const sceneFootage = (project.script?.scenes || [])
              .map((s: any) => ({
                sceneId: s.id,
                videoUrl: s.footage?.videoUrl || "",
                duration: s.duration || 0,
              }))
              .filter((s: any) => s.videoUrl);

            // ===== WORKER FLOW: enqueue job → subscribe progress via SSE =====
            // 1. POST ke /api/generate-video → dapat jobId (worker terpisah yang render)
            // 2. Subscribe ke /api/video-progress?projectId=xxx via EventSource
            const vidRes = await fetchWithTimeout("/api/generate-video", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                audioUrl: project.audio.url,
                subtitleUrl: project.subtitle.url || project.subtitle.srtContent,
                projectId: project.id,
                genre: project.genre,
                platform: project.platform,
                backgroundUrl,
                subtitleSegments: project.subtitle?.segments || [],
                subtitleStyle: project.subtitle?.style,
                sceneFootage,
                scenes: project.script?.scenes || [],
              }),
            }, 30_000); // timeout enqueue 30 detik — render asinkron

            if (!vidRes.ok) {
              const errBody = await vidRes.json().catch(() => ({}));
              throw withErrorCode(
                new Error(errBody.error || `Video render gagal (HTTP ${vidRes.status})`),
                vidRes.status,
                errBody.code,
                vidRes.headers.get("Retry-After")
              );
            }

            const vidJson = await vidRes.json();
            if (!vidJson.success || !vidJson.jobId) {
              throw new Error("Gagal membuat job render: tidak ada jobId");
            }

            const jobId = vidJson.jobId;
            // Fase 4C: hanya pesan SSE milik job ini yang dipakai. Pesan dari job
            // lama (project sama, klik sebelumnya) diabaikan supaya `done` job lama
            // tidak menyelesaikan tunggu job baru.
            const activeJobId = jobId;
            console.log(`[Pipeline] Job enqueued: ${jobId}`);

            // Worker belum tentu langsung mengambil job (antre di BullMQ) →
            // katakan apa adanya, bukan angka % palsu. `reused` = server
            // menemukan job aktif untuk project+media yang sama (REL-06):
            // kita menyambung ke job itu, TANPA menembak job kedua.
            setProgress((prev) => ({
              ...prev,
              // Fase 4B: dipakai pemilih aksi lanjutan ("Sambungkan ke Render").
              videoJobActive: vidJson.reused === true,
              statusMessage: vidJson.reused
                ? "Menyambung ke render yang sedang berjalan..."
                : "Menunggu antrean render...",
            }));

            // 2. Subscribe progress via EventSource (SSE dari Redis pub/sub)
            // `project.id` diambil dulu: di dalam `function` hoisted, TS tidak
            // membawa penyempitan tipe (narrowing) dari scope luar.
            const streamProjectId = project.id;
            const videoUrl = await new Promise<string>((resolve, reject) => {
              let settled = false;
              let streamError: string | null = null;
              let lastPercent: number | null = null;
              let recoveryUsed = false;
              let lastMsgAt = Date.now();
              let es: EventSource | null = null;

              // Safety timeout total (15 menit — render panjang + upload)
              const TOTAL_TIMEOUT_MS = 15 * 60 * 1000;
              const totalTimer = setTimeout(() => {
                finish(() => reject(new Error("Render video timeout (15 menit). Coba render ulang.")));
              }, TOTAL_TIMEOUT_MS);

              // REL-01: watchdog. Ambang mengikuti fase: 120 dtk bila belum ada
              // percent (antre/persiapan), 30 dtk saat FFmpeg mengirim progress,
              // 120 dtk lagi saat menunggu upload (lihat
              // src/lib/pipeline/video-watchdog.ts). Tidak ada endpoint status
              // job terpisah → pemulihan = reconnect sekali.
              const watchdogTimer = setInterval(() => {
                const decision = decideWatchdog({
                  lastPercent,
                  recoveryUsed,
                  idleMs: Date.now() - lastMsgAt,
                });
                if (decision === "wait") return;
                if (decision === "recover") {
                  recover();
                  return;
                }
                finish(() => reject(new Error("Progres render terputus. Coba render ulang.")));
              }, 1_000);

              function cleanup() {
                clearInterval(watchdogTimer);
                clearTimeout(totalTimer);
                // Tutup koneksi supaya tidak ada progress ganda saat "Coba Lagi".
                es?.close();
                es = null;
              }

              function finish(next: () => void) {
                if (settled) return;
                settled = true;
                cleanup();
                next();
              }

              function recover() {
                if (settled) return;
                recoveryUsed = true;
                lastMsgAt = Date.now();
                console.warn("[Pipeline] progres video sepi — reconnect SSE sekali");
                setProgress((prev) => ({
                  ...prev,
                  statusMessage: "Koneksi progres tersendat — menyambung ulang...",
                }));
                openStream();
              }

              // REL-06: tiap koneksi diberi nomor urut. Pesan/error dari koneksi
              // LAMA (yang sudah di-close saat recover) diabaikan total, supaya
              // stream job lama tidak mencampuri percobaan retry yang baru.
              let streamSeq = 0;
              function openStream() {
                if (settled) return;
                es?.close(); // jangan sampai ada dua koneksi hidup
                const seq = ++streamSeq;
                const current = new EventSource(
                  `/api/video-progress?projectId=${encodeURIComponent(streamProjectId)}`
                );
                es = current;
                const isStale = () => settled || seq !== streamSeq;

                current.onopen = () => {
                  if (isStale()) return;
                  lastMsgAt = Date.now();
                };

                current.onmessage = (event) => {
                  if (isStale()) return;
                  lastMsgAt = Date.now();
                  let msg: any;
                  try {
                    msg = JSON.parse(event.data);
                  } catch {
                    return;
                  }

                  console.log("[SSE progress]", msg);

                  // Fase 4C + 5F: buang pesan dari job lain. Worker kini
                  // melampirkan jobId pada SEMUA pesan (processing, percent,
                  // done, error) — pesan SSE lama tidak lagi menimpa state
                  // render yang sedang berjalan.
                  if (msg.jobId && activeJobId && msg.jobId !== activeJobId) {
                    console.warn(`[SSE progress] abaikan pesan job lain: ${msg.jobId}`);
                    return;
                  }

                  if (typeof msg.percent === "number") {
                    lastPercent = msg.percent;
                    setProgress((prev) => {
                      const next = Math.max(prev.progress, msg.percent);
                      return { ...prev, progress: next, statusMessage: `Merender video... ${Math.round(next)}%` };
                    });
                  } else if (msg.status === "processing") {
                    setProgress((prev) => ({
                      ...prev,
                      statusMessage: "Memproses render di server...",
                    }));
                  } else if (msg.status === "uploading") {
                    setProgress((prev) => ({
                      ...prev,
                      statusMessage: "Mengunggah video ke cloud...",
                    }));
                  } else if (msg.status === "done") {
                    const url = msg.videoUrl as string | undefined;
                    if (!url) {
                      finish(() => reject(new Error("Video render selesai tanpa URL")));
                      return;
                    }
                    finish(() => resolve(url));
                  } else if (msg.status === "error") {
                    streamError = msg.message || "Video render gagal";
                    const message = streamError;
                    finish(() => reject(new Error(message || "Video render gagal")));
                  }
                };

                current.onerror = () => {
                  if (isStale()) return;
                  if (streamError) {
                    const message = streamError;
                    finish(() => reject(new Error(message || "Video render gagal")));
                    return;
                  }
                  if (!recoveryUsed) {
                    recover();
                    return;
                  }
                  finish(() =>
                    reject(new Error("Koneksi progres render terputus. Coba render ulang."))
                  );
                };
              }

              openStream();
            });

            // ===== TRACING SEMENTARA — verifikasi setVideoResult =====
            console.log("[Pipeline] calling setVideoResult with:", videoUrl);
            store.setVideoResult({
              id: project.id,
              url: videoUrl,
              duration: 0,
              format: "mp4",
              resolution: "1080x1920", // worker update projects table; resolution detail dari SSE done
            } as VideoResult);
            // Tandai project completed saat video selesai — bukan hanya saat export.
            store.updateProjectStatus("completed");
            track("video_generated", {
              resolution: "1080x1920",
              durasi: project.targetDuration || 0,
            });
            break;
          }
          case "export": {
            // Export step just marks completion
            store.updateProjectStatus("completed");
            break;
          }
        }

        setProgress((prev) => ({
          ...prev,
          progress: 100,
          statusMessage: `${STEP_MESSAGES[step]} — Selesai!`,
        }));

        await sleep(300);
        if (step === "audio") {
          console.log("[Pipeline] audio complete");
        }
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Terjadi kesalahan";
        // Fase 4B: kode dari API (CREDIT_EXHAUSTED/RATE_LIMITED/AUTH_REQUIRED)
        // menentukan aksi lanjutan di sticky bar.
        const errorCode = (error as { code?: string } | null)?.code ?? null;
        const retryAfterSeconds =
          (error as { retryAfterSeconds?: number } | null)?.retryAfterSeconds ?? null;

        // 5D: 401 dari endpoint mahal (anon) BUKAN error merah — cukup sinyal
        // untuk membuka gate daftar; step tidak ditandai gagal.
        if (errorCode === "AUTH_REQUIRED") {
          console.warn("[Pipeline] endpoint butuh login — buka gate daftar");
          setProgress((prev) => ({
            ...prev,
            progress: 0,
            error: null,
            errorCode,
            errorStep: null,
            requiresAuth: true,
            isRunning: false,
          }));
          return false;
        }

        store.updateProjectStep(step, "error");
        if (step === "subtitle") {
          // D7: subtitle adalah dependency internal audio → jangan pakai
          // errorStep; kartu audio tetap "done" dengan blok error subtitle.
          console.error("[Pipeline] subtitle auto-chain error:", errorMessage);
          setProgress((prev) => ({
            ...prev,
            progress: 0,
            subtitleError: errorMessage,
            isRunning: false,
          }));
          return false;
        }
        setProgress((prev) => ({
          ...prev,
          progress: 0,
          error: errorMessage,
          errorCode,
          retryAfterSeconds,
          errorStep: step,
          isRunning: false,
        }));
        return false;
      } finally {
        // Hentikan timer "proses lama" setelah API selesai (sukses/gagal).
        if (slowTimer) clearTimeout(slowTimer);
      }
    },
    [store]
  );

  /**
   * D7: subtitle adalah dependency internal audio → video. Jalankan dengan
   * retry otomatis supaya satu kegagalan (mis. jaringan) tidak langsung
   * memblokir user di step video dengan pesan teknis.
   */
  const generateSubtitle = useCallback(
    async (projectId: string, retriesLeft = 1): Promise<boolean> => {
      const freshProject = useProjectStore.getState().projects.find((p) => p.id === projectId);
      const audioUrl = freshProject?.audio?.url;
      let ok = (await generateSingleStep("subtitle", projectId, undefined, audioUrl)) === true;
      let remaining = retriesLeft;
      while (!ok && remaining > 0) {
        console.warn(`[Pipeline] subtitle gagal — retry otomatis (sisa ${remaining})`);
        remaining -= 1;
        ok = (await generateSingleStep("subtitle", projectId, undefined, audioUrl)) === true;
      }
      return ok;
    },
    [generateSingleStep]
  );

  // Step-by-step: generate one step at a time
  // Returns: boolean (true = sukses) untuk generate penuh, atau string URL untuk preview audio
  const generateStep = useCallback(
    async (step: PipelineStep, projectId: string, audioOptions?: AudioOptions) => {
      // REL-06: tolak klik/Enter dobel secara SINKRON — state `isRunning` baru
      // berubah setelah re-render, jadi belum bisa menahan klik kedua.
      if (busyRef.current) {
        console.warn(`[Pipeline] step ${step} ditolak: masih ada proses berjalan`);
        return false;
      }
      busyRef.current = true;
      try {
        setProgress((prev) => ({ ...prev, isRunning: true, error: null, errorStep: null, limitProject: null }));
        const result = await generateSingleStep(step, projectId, audioOptions);
        if (result === true) {
          store.advanceStep(step);

          // AUTO-CHAIN: setelah Audio sukses, otomatis generate Subtitle.
          // Subtitle adalah dependency internal dari Video — bukan destination step.
          // Jika subtitle gagal, Audio TETAP "done" — jangan rollback.
          // User tetap bisa masuk Video Composition meskipun subtitle error.
          if (step === "audio") {
            // Subtitle = dependency internal video → retry otomatis 1x (D7).
            await generateSubtitle(projectId);
          }
        }
        setProgress((prev) => ({ ...prev, isRunning: false }));

        // Beri tahu hook useUsage agar kredit/plan di-refresh setelah generate selesai.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("usage:refresh"));
        }

        return result;
      } finally {
        busyRef.current = false;
      }
    },
    [generateSingleStep, generateSubtitle, store]
  );

  // Auto-chain behavior-aware: script → (audio+subtitle) → video in un colpo,
  // tenendo isRunning=true per tutto il percorso (niente flicker tra gli step).
  const runAutoChain = useCallback(
    async (projectId: string, opts?: { audioOptions?: AudioOptions }) => {
      // REL-06: chain tumpang tindih (klik dobel, auto-generate beruntun, atau
      // auto-generate + klik manual) ditolak di sini, bukan hanya lewat state.
      if (busyRef.current) {
        console.warn("[Pipeline] auto-chain ditolak: masih ada proses berjalan");
        return false;
      }
      busyRef.current = true;

      // Fase 4B + 5A: "step mana yang masih perlu dijalankan" diputuskan oleh
      // fungsi murni planChainSteps (bisa diuji tanpa React). Setelah invalidasi
      // hilir (5A: regen script/audio/subtitle) step yang direset WAJIB muncul
      // lagi di sini — jangan sampai dilewati karena data basi.
      const fresh = useProjectStore.getState().currentProject;
      const plan = planChainSteps({
        hasScript: !!fresh?.script?.scenes?.length,
        hasAudio: !!fresh?.audio?.url,
        hasSubtitle: !!fresh?.subtitle,
        hasVideo: !!fresh?.video?.url,
      });
      const firstStep: PipelineStep = plan[0] ?? "video";

      setProgress((prev) => ({
        ...prev,
        isRunning: true,
        error: null,
        errorStep: null,
        errorCode: null,
        subtitleError: null,
        currentStep: firstStep,
        progress: 0,
        statusMessage: STEP_MESSAGES[firstStep],
      }));
      try {
        for (const step of plan) {
          if (step === "subtitle") {
            const okSubtitle = await generateSubtitle(projectId);
            // D7: subtitle gagal → berhenti di sini (user diberi "Buat ulang
            // subtitle" di kartu audio); jangan lanjut ke video dengan pesan teknis.
            if (!okSubtitle) return false;
            continue;
          }

          const ok = await generateSingleStep(
            step,
            projectId,
            step === "audio" ? opts?.audioOptions : undefined
          );
          if (ok !== true) return false;
          store.advanceStep(step);
        }
        return true;
      } finally {
        setProgress((prev) => ({ ...prev, isRunning: false }));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("usage:refresh"));
        }
        busyRef.current = false;
      }
    },
    [generateSingleStep, generateSubtitle, store]
  );

  // Preview audio: fetch 7 kata pertama TANPA menyentuh progress/isRunning/step status.
  // Kembalikan Blob URL audio preview (string) atau null jika gagal.
  const previewAudio = useCallback(
    async (projectId: string, audioOptions?: AudioOptions): Promise<string | null> => {
      const project = useProjectStore.getState().projects.find((p) => p.id === projectId);
      if (!project?.script) return null;

      const opts = audioOptions || {};
      const scenes = project.script.scenes.map((s: { content: string }) => ({
        narration: s.content,
      }));

      const provider = opts.provider || "cartesia";
      let settings: unknown;
      if (provider === "cartesia") {
        settings = {
          voice_id: opts.voice_id || "",
          speed: opts.speed || 1.0,
          ...(opts.emotion ? { emotion: opts.emotion } : {}),
        };
      } else if (provider === "elevenlabs") {
        settings = {
          voice_id: "",
          stability: opts.stability ?? 0.5,
          similarity_boost: opts.similarity_boost ?? 0.75,
          style: opts.style ?? 0.5,
          use_speaker_boost: opts.use_speaker_boost ?? true,
          speed: opts.speed || 1.0,
        };
      } else {
        settings = {
          lang: opts.lang || "id",
          tld: opts.tld || "com",
          slow: opts.slow || false,
        };
      }

      try {
        const res = await fetchWithTimeout("/api/generate-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenes,
            provider,
            settings,
            preview: true,
          }),
        }, 30_000);

        if (!res.ok) {
          // Khusus 429 PREVIEW_USED → lempar error ber-`code` agar UI bisa
          // menampilkan gate daftar, bukan sekadar error generik.
          const json = res.status === 429 ? await res.json().catch(() => null) : null;
          if (json?.code === "PREVIEW_USED") {
            const e = new Error(json.error || "Suka suaranya? Daftar gratis untuk lanjut.");
            (e as any).code = "PREVIEW_USED";
            throw e;
          }
          let errorMsg = `Preview TTS gagal (${res.status})`;
          try {
            if (!json && res.status !== 429) {
              const j = await res.json();
              if (j.error) errorMsg = j.error;
            }
          } catch {
            // ignore
          }
          throw new Error(errorMsg);
        }

        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch (err) {
        // REL-05: jangan telan error — pemanggil butuh `code: PREVIEW_USED`
        // untuk memunculkan gate "Daftar gratis". `null` hanya untuk kasus
        // "tidak ada yang bisa di-preview" (script belum ada).
        console.error("[usePipeline] Preview audio gagal:", err);
        throw err;
      }
    },
    []
  );

  const resetProgress = useCallback(() => {
    setProgress({
      currentStep: "script",
      progress: 0,
      statusMessage: "",
      isRunning: false,
      error: null,
      errorStep: null,
      subtitleError: null,
      slow: false,
    });
  }, []);

  /** 5D: dipanggil halaman setelah membuka gate daftar → bersihkan sinyal 401. */
  const resetAuthSignal = useCallback(() => {
    setProgress((prev) => ({ ...prev, requiresAuth: false }));
  }, []);


  return {
    progress,
    generateStep,
    runAutoChain,
    previewAudio,
    resetProgress,
    resetAuthSignal,
  };
}
