"use client";

import { useState, useCallback } from "react";
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
import { generateId, sleep } from "@/lib/utils";

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

export interface PipelineProgress {
  currentStep: PipelineStep;
  progress: number; // 0-100 — hanya bermakna untuk video (data SSE riil)
  statusMessage: string;
  isRunning: boolean;
  error: string | null;
  /** Langkah "thinking" step aktif (script/audio/subtitle) — muncul satu per satu. */
  thinkSteps?: string[];
  /** Indeks langkah thinking yang sudah muncul (0-based). */
  thinkActiveIndex?: number;
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

/** Urutan langkah "thinking" per step (script/audio/subtitle) — muncul satu per satu.
 *  Video memakai % riil via SSE, jadi kosong. */
const STEP_THINK_STEPS: Record<PipelineStep, string[]> = {
  script: [
    "Menganalisis topik",
    "Menyusun struktur naskah",
    "Menulis pembuka (hook)",
    "Mengembangkan narasi & scene",
    "Menyempurnakan penutup & CTA",
    "Menyimpan naskah",
  ],
  audio: [
    "Menyiapkan suara",
    "Menghasilkan narasi (TTS)",
    "Memproses audio",
    "Mengunggah audio ke cloud",
    "Menyelesaikan audio",
  ],
  subtitle: [
    "Memuat audio",
    "Membuat subtitle",
    "Menyinkronkan timing",
    "Menyimpan subtitle",
  ],
  video: [],   // progress % riil via SSE — tanpa thinking steps
  export: [],
};

/** Interval tiap langkah thinking muncul (ms). */
const THINK_TIMING_MS = 750;

// (Fake progress interval dihapus — persen hanya ditampilkan untuk video via SSE.)

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
  });

  const store = useProjectStore();

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
      }));

      const isVideoStep = step === "video";
      const thinkList = STEP_THINK_STEPS[step] || [];
      let progressInterval: ReturnType<typeof setInterval> | undefined;
      let thinkTimer: ReturnType<typeof setInterval> | undefined;

      try {
        if (!isVideoStep) {
          // TANPA angka % palsu — tampilkan langkah "thinking" satu per satu (CSS).
          setProgress((prev) => ({
            ...prev,
            thinkSteps: thinkList,
            thinkActiveIndex: 0,
            statusMessage: thinkList[0] || prev.statusMessage,
          }));
          thinkTimer = setInterval(() => {
            setProgress((prev) => {
              const next = Math.min((prev.thinkActiveIndex ?? 0) + 1, thinkList.length - 1);
              return {
                ...prev,
                thinkActiveIndex: next,
                statusMessage: thinkList[next] || prev.statusMessage,
              };
            });
          }, THINK_TIMING_MS);
        } else {
          // Video: hanya nudge kecil agar tidak terlihat "beku" sampai frame SSE pertama.
          const cap = 15;
          progressInterval = setInterval(() => {
            setProgress((prev) => ({ ...prev, progress: Math.min(prev.progress + 1, cap) }));
          }, 600);
        }

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
throw new Error(json.error || "Generate script gagal");
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
              try {
                const json = await res.json();
                if (json.error) errorMsg = json.error;
              } catch {
                // ignore — response bukan JSON (mungkin error binary)
              }
              throw new Error(errorMsg);
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
            // ===== LOGGING VERIFIKASI (sementara) =====
            console.log(`[Pipeline] audio result URL: ${audioUrl}`);
            console.log(`[Pipeline] audio status: ${useProjectStore.getState().currentProject?.steps.audio}`);
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
              throw new Error(errBody.error || `Video render gagal (HTTP ${vidRes.status})`);
            }

            const vidJson = await vidRes.json();
            if (!vidJson.success || !vidJson.jobId) {
              throw new Error("Gagal membuat job render: tidak ada jobId");
            }

            const jobId = vidJson.jobId;
            console.log(`[Pipeline] Job enqueued: ${jobId}`);

            // 2. Subscribe progress via EventSource (SSE dari Redis pub/sub)
            const videoUrl = await new Promise<string>((resolve, reject) => {
              let streamError: string | null = null;
              let doneUrl: string | undefined;
              let doneResolution: string | undefined;

              const es = new EventSource(`/api/video-progress?projectId=${encodeURIComponent(project.id)}`);

              // Safety timeout total (15 menit — render panjang + upload)
              const TOTAL_TIMEOUT_MS = 15 * 60 * 1000;
              const totalTimer = setTimeout(() => {
                es.close();
                reject(new Error("Render video timeout (15 menit). Coba render ulang."));
              }, TOTAL_TIMEOUT_MS);

              es.onmessage = (event) => {
                let msg: any;
                try {
                  msg = JSON.parse(event.data);
                } catch {
                  return;
                }

                console.log("[SSE progress]", msg);

                if (typeof msg.percent === "number") {
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
                  doneUrl = msg.videoUrl;
                  doneResolution = msg.resolution;
                  clearTimeout(totalTimer);
                  es.close();
                  if (doneUrl) {
                    resolve(doneUrl);
                  } else {
                    reject(new Error("Video render selesai tanpa URL"));
                  }
                } else if (msg.status === "error") {
                  streamError = msg.message || "Video render gagal";
                  clearTimeout(totalTimer);
                  es.close();
                  reject(new Error(streamError || "Video render gagal"));
                }
              };

              es.onerror = () => {
                // EventSource auto-reconnect; hanya reject jika sudah ada error message
                if (streamError) {
                  clearTimeout(totalTimer);
                  es.close();
                  reject(new Error(streamError));
                }
              };
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
        store.updateProjectStep(step, "error");
        if (step === "subtitle") {
          // Subtitle adalah dependency internal — layan error tanpa menggagalkan audio.
          console.error("[Pipeline] subtitle auto-chain error:", errorMessage);
        }
        setProgress((prev) => ({
          ...prev,
          progress: 0,
          error: errorMessage,
          isRunning: false,
        }));
        return false;
      } finally {
        // Hentikan semua timer setelah API selesai (sukses/gagal).
        if (progressInterval) clearInterval(progressInterval);
        if (thinkTimer) clearInterval(thinkTimer);
      }
    },
    [store]
  );

  // Step-by-step: generate one step at a time
  // Returns: boolean (true = sukses) untuk generate penuh, atau string URL untuk preview audio
  const generateStep = useCallback(
    async (step: PipelineStep, projectId: string, audioOptions?: AudioOptions) => {
      setProgress((prev) => ({ ...prev, isRunning: true, error: null, limitProject: null }));
      const result = await generateSingleStep(step, projectId, audioOptions);
      if (result === true) {
        store.advanceStep(step);

        // AUTO-CHAIN: setelah Audio sukses, otomatis generate Subtitle.
        // Subtitle adalah dependency internal dari Video — bukan destination step.
        // Jika subtitle gagal, Audio TETAP "done" — jangan rollback.
        // User tetap bisa masuk Video Composition meskipun subtitle error.
        if (step === "audio") {
          // Ambil audioUrl dari state TERBARU (hindari stale state/race condition).
          const freshProject = useProjectStore.getState().projects.find((p) => p.id === projectId);
          const audioUrl = freshProject?.audio?.url;
          await generateSingleStep("subtitle", projectId, undefined, audioUrl);
        }
      }
      setProgress((prev) => ({ ...prev, isRunning: false }));

      // Beri tahu hook useUsage agar kredit/plan di-refresh setelah generate selesai.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("usage:refresh"));
      }

      return result;
    },
    [generateSingleStep, store]
  );

  // Auto-chain behavior-aware: script → (audio+subtitle) → video in un colpo,
  // tenendo isRunning=true per tutto il percorso (niente flicker tra gli step).
  const runAutoChain = useCallback(
    async (projectId: string, opts?: { audioOptions?: AudioOptions }) => {
      setProgress((prev) => ({
        ...prev,
        isRunning: true,
        error: null,
        currentStep: "script",
        progress: 0,
        statusMessage: STEP_MESSAGES.script,
      }));
      try {
        const okScript = await generateSingleStep("script", projectId);
        if (okScript !== true) return false;
        store.advanceStep("script");

        // AUDIO + SUBTITLE (subtitle = dependency interna di video)
        const okAudio = await generateSingleStep("audio", projectId, opts?.audioOptions);
        if (okAudio !== true) return false;
        store.advanceStep("audio");
        const freshProject = useProjectStore.getState().projects.find((p) => p.id === projectId);
        await generateSingleStep("subtitle", projectId, undefined, freshProject?.audio?.url);

        // VIDEO
        const okVideo = await generateSingleStep("video", projectId);
        if (okVideo !== true) return false;
        store.advanceStep("video");
        return true;
      } finally {
        setProgress((prev) => ({ ...prev, isRunning: false }));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("usage:refresh"));
        }
      }
    },
    [generateSingleStep, store]
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
        console.error("[usePipeline] Preview audio gagal:", err);
        return null;
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
      thinkSteps: [],
      thinkActiveIndex: 0,
    });
  }, []);


  return {
    progress,
    generateStep,
    runAutoChain,
    previewAudio,
    resetProgress,
  };
}
