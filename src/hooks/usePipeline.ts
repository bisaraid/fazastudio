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

export interface PipelineProgress {
  currentStep: PipelineStep;
  progress: number; // 0-100
  statusMessage: string;
  isRunning: boolean;
  error: string | null;
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
 * Tahap pesan per progress (%) — agar user selalu tahu apa yang sistem kerjakan.
 * Pesan dipilih berdasarkan persentase terakhir yang dilewati (monotonik).
 */
const STEP_STAGES: Record<PipelineStep, { at: number; msg: string }[]> = {
  script: [
    { at: 3, msg: "Mempersiapkan topik..." },
    { at: 18, msg: "Menentukan hook & struktur naskah..." },
    { at: 40, msg: "Menulis pembuka (hook)..." },
    { at: 62, msg: "Mengembangkan narasi & scene..." },
    { at: 85, msg: "Menyempurnakan penutup & CTA..." },
    { at: 96, msg: "Menyimpan naskah..." },
  ],
  audio: [
    { at: 5, msg: "Menyiapkan teks narasi..." },
    { at: 25, msg: "Menghasilkan suara (TTS)..." },
    { at: 55, msg: "Memproses & mengoptimalkan audio..." },
    { at: 85, msg: "Mengunggah audio ke cloud..." },
    { at: 96, msg: "Menyelesaikan audio..." },
  ],
  subtitle: [
    { at: 5, msg: "Memuat audio untuk transkripsi..." },
    { at: 20, msg: "Mengirim ke transkripsi (Whisper)..." },
    { at: 60, msg: "Menyinkronkan timing subtitle..." },
    { at: 85, msg: "Menyusun SRT/VTT..." },
    { at: 96, msg: "Menyimpan subtitle..." },
  ],
  video: [
    { at: 5, msg: "Menyiapkan footage & audio..." },
    { at: 20, msg: "Merender video (FFmpeg)..." },
    { at: 60, msg: "Menyusun caption/subtitle..." },
    { at: 85, msg: "Mengompresi & finalisasi..." },
    { at: 96, msg: "Mengunggah video ke cloud..." },
  ],
  export: [{ at: 0, msg: "Menyiapkan hasil akhir..." }],
};

/** Pilih pesan tahap berdasarkan progress terakhir yang dilewati. */
function stageMessage(step: PipelineStep, progress: number): string {
  const stages = STEP_STAGES[step] || [];
  let msg = STEP_MESSAGES[step];
  for (const s of stages) {
    if (progress >= s.at) msg = s.msg;
  }
  return msg;
}

/**
 * Update progress secara MONOTONIK (hanya naik, tidak pernah turun).
 * Dipakai oleh interval & SSE agar angka tidak "maju-mundur".
 */
function bumpProgress(
  prev: PipelineProgress,
  next: number,
  step?: PipelineStep
): PipelineProgress {
  const target = Math.min(100, Math.max(prev.progress, next));
  return {
    ...prev,
    progress: target,
    statusMessage: step ? stageMessage(step, target) : prev.statusMessage,
  };
}

/**
 * Mapping Genre ACS → CategoryId ViraLoop (1:1 karena sudah disamakan)
 */
function mapGenreToCategory(genre: Genre): CategoryId {
  // Genre ACS sekarang identik dengan CategoryId ViraLoop
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

      let progressInterval: ReturnType<typeof setInterval> | undefined;

      try {
        // Progress MONOTONIK dengan pesan tahap — hanya naik, tidak pernah turun.
        // Untuk VIDEO, interval TIDAK memakai angka acak (sumber utamanya SSE);
        // cukup nudge kecil agar tidak terlihat "beku" saat menunggu frame pertama.
        // Untuk script/audio/subtitle: interval naik pelan sampai 92% (API tak kirim %).
        const isVideoStep = step === "video";
        const cap = isVideoStep ? 40 : 92;
        progressInterval = setInterval(() => {
          setProgress((prev) =>
            bumpProgress(prev, Math.min(prev.progress + (isVideoStep ? 1 : 2.5), cap), step)
          );
        }, isVideoStep ? 450 : 260);

        switch (step) {
          case "script": {
            const categoryId = mapGenreToCategory(project.genre);
            const duration = mapDurationToTier(project.targetDuration);

            // Panggil API route (server-side) — TIDAK import fungsi server langsung
            const res = await fetch("/api/generate-script", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topic: project.topic,
                categoryId,
                customGenre: project.customGenre,
                duration,
                targetDuration: project.targetDuration,
                platform: project.platform,
                identityKey: `anon:${project.id}`,
                projectId,
              }),
            });
            const json = await res.json();
            if (!json.success || !json.data) {
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
            break;
          }
          case "audio": {
            if (!project.script) throw new Error("Script belum digenerate");
            const opts = audioOptions || {};
            // ACS Scene.content → narration untuk TTS (mirror viralop)
            const scenes = project.script.scenes.map((s: { content: string }) => ({
              narration: s.content,
            }));

            // Bangun settings object per provider (mirror viralop)
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

            const res = await fetch("/api/generate-tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                scenes,
                provider,
                settings,
                preview: opts.preview,
                projectId,
              }),
            });

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
            const subRes = await fetch("/api/generate-subtitle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                audioUrl,
                projectId: project.id,
              }),
            });
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
                const footageRes = await fetch("/api/footage", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    query: visualPrompt,
                    genre: project.genre,
                    perPage: 3,
                  }),
                });
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

            // ===== SSE STREAMING: POST + ReadableStream (EventSource tidak support POST body) =====
            // /api/generate-video kini mengembalikan Server-Sent Events:
            //   data: {"percent": 0..100}
            //   data: {"status":"done","videoUrl":"..."}
            //   data: {"status":"error","message":"..."}
            const vidRes = await fetch("/api/generate-video", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                audioUrl: project.audio.url,
                subtitleUrl: project.subtitle.url || project.subtitle.srtContent,
                projectId: project.id,
                genre: project.genre,
                platform: project.platform,
                backgroundUrl,
                // SOURCE OF TRUTH — dikirim dari project state terbaru.
                // subtitleUrl tetap sebagai fallback backward compat di renderer.
                subtitleSegments: project.subtitle?.segments || [],
                subtitleStyle: project.subtitle?.style,
                // Timeline: footage per scene untuk concat (jika ada)
                sceneFootage,
              }),
            });

            if (!vidRes.ok || !vidRes.body) {
              throw new Error(`Video render gagal (HTTP ${vidRes.status})`);
            }

            const reader = vidRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let videoUrl: string | undefined;
            let resolution: string | undefined;
            let streamError: string | null = null;

            // Safety timeout: jika stream idle terlalu lama (mis. upload R2
            // menggantung), hentikan loop agar spinner UI tidak "beku di 100%".
            const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

            while (true) {
              const idle = new Promise<"idle">((resolve) =>
                setTimeout(() => resolve("idle"), IDLE_TIMEOUT_MS)
              );
              const raced = await Promise.race([reader.read(), idle]);
              if (raced === "idle") {
                streamError =
                  "Koneksi stream video terputus (timeout 5 menit). Coba render ulang.";
                break;
              }
              const { done, value } = raced;
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              // Parse baris "data: {...}" dari SSE
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const payload = trimmed.slice(5).trim();
                if (!payload) continue;
                let msg: any;
                try {
                  msg = JSON.parse(payload);
                } catch {
                  continue;
                }
                // ===== TRACING SEMENTARA — untuk verifikasi alur SSE =====
                console.log("[SSE]", msg);
                if (typeof msg.percent === "number") {
                  // Progress nyata dari FFmpeg — lewat bumpProgress agar monotonik
                  // (abaikan nilai yang lebih kecil dari yang sudah tercapai),
                  // dan set pesan tahap video berdasarkan persen.
                  setProgress((prev) => bumpProgress(prev, msg.percent, step));
                } else if (msg.status === "uploading") {
                  // FFmpeg selesai — sekarang tahap upload ke storage.
                  // Tampilkan pesan eksplisit agar UI tidak terlihat beku di 100%.
                  console.log("[SSE] uploading:", msg.message);
                  setProgress((prev) => ({
                    ...prev,
                    statusMessage: msg.message || "Mengunggah video ke cloud...",
                  }));
                } else if (msg.status === "done") {
                  console.log("[SSE done] videoUrl:", msg.videoUrl);
                  videoUrl = msg.videoUrl;
                  resolution = msg.resolution;
                } else if (msg.status === "error") {
                  streamError = msg.message || "Video render gagal";
                }
              }
            }

            if (streamError) {
              throw new Error(streamError);
            }
            if (!videoUrl) {
              throw new Error("Video render gagal: tidak ada videoUrl dari stream");
            }

            // ===== TRACING SEMENTARA — verifikasi setVideoResult =====
            console.log("[SSE] calling setVideoResult with:", videoUrl);
            store.setVideoResult({
              id: project.id,
              url: videoUrl,
              duration: 0,
              format: "mp4",
              resolution: resolution || "1080x1920",
            } as VideoResult);
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
        // Selalu hentikan interval progress setelah API selesai (sukses/gagal).
        if (progressInterval) clearInterval(progressInterval);
      }
    },
    [store]
  );

  // Step-by-step: generate one step at a time
  // Returns: boolean (true = sukses) untuk generate penuh, atau string URL untuk preview audio
  const generateStep = useCallback(
    async (step: PipelineStep, projectId: string, audioOptions?: AudioOptions) => {
      setProgress((prev) => ({ ...prev, isRunning: true, error: null }));
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
      return result;
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
        const res = await fetch("/api/generate-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenes,
            provider,
            settings,
            preview: true,
          }),
        });

        if (!res.ok) {
          let errorMsg = `Preview TTS gagal (${res.status})`;
          try {
            const json = await res.json();
            if (json.error) errorMsg = json.error;
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
    });
  }, []);


  return {
    progress,
    generateStep,
    previewAudio,
    resetProgress,
  };
}
