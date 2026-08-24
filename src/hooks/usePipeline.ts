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

      try {
        // Simulate progress animation
        const progressInterval = setInterval(() => {
          setProgress((prev) => ({
            ...prev,
            progress: Math.min(prev.progress + Math.random() * 15, 90),
          }));
        }, 500);

        // Simulate API delay (1-3 seconds)
        await sleep(1500 + Math.random() * 1500);

        clearInterval(progressInterval);

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
              voiceName:
                usedProvider === "elevenlabs"
                  ? "ElevenLabs"
                  : usedProvider === "cartesia"
                  ? "Cartesia"
                  : "Google TTS",
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
                fontSize: 24,
                color: "#FFFFFF",
                position: "bottom",
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

            while (true) {
              const { done, value } = await reader.read();
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
                  setProgress((prev) => ({ ...prev, progress: msg.percent }));
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

  // Full Auto: generate all steps sequentially
  const generateAll = useCallback(
    async (formData: WizardFormData) => {
      setProgress((prev) => ({ ...prev, isRunning: true, error: null }));

      // Create project first
      const project = await store.createProject(formData);
      store.updateProjectStatus("processing");

      const steps: PipelineStep[] = ["script", "audio", "subtitle", "video"];

      for (const step of steps) {
        const success = await generateSingleStep(step, project.id);
        if (!success) {
          store.updateProjectStatus("draft");
          return;
        }
      }

      // Mark as completed
      store.updateProjectStatus("completed");
      store.advanceStep("video");

      setProgress((prev) => ({
        ...prev,
        currentStep: "export",
        progress: 100,
        statusMessage: "Semua selesai! Video siap di-export.",
        isRunning: false,
      }));
    },
    [generateSingleStep, store]
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

  // ===== EXPORT (ZIP) =====
  const exportProject = useCallback(
    async (projectId: string): Promise<{ success: boolean; error?: string }> => {
      const project = useProjectStore.getState().projects.find((p) => p.id === projectId);
      if (!project) return { success: false, error: "Project tidak ditemukan" };

      setProgress((prev) => ({
        ...prev,
        currentStep: "export",
        progress: 0,
        statusMessage: "Menyiapkan file export...",
        isRunning: true,
        error: null,
      }));

      try {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();

        // 1. script.txt
        const scriptText = project.script?.fullScript || project.script?.scenes?.map((s) => s.content).join("\n\n") || "";
        zip.file("script.txt", scriptText);

        // 2. audio.mp3 — download dari audio_url
        if (project.audio?.url) {
          const audioRes = await fetch(project.audio.url);
          if (audioRes.ok) {
            const audioBlob = await audioRes.blob();
            zip.file("audio.mp3", audioBlob);
          }
        }

        // 3. subtitle.srt — download dari subtitle_url
        if (project.subtitle?.srtContent) {
          zip.file("subtitle.srt", project.subtitle.srtContent);
        }

        // 4. video.mp4 — download dari video_url
        if (project.video?.url) {
          const videoRes = await fetch(project.video.url);
          if (videoRes.ok) {
            const videoBlob = await videoRes.blob();
            zip.file("video.mp4", videoBlob);
          }
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });

        // Trigger download otomatis
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${project.title || "project"}-export.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setProgress((prev) => ({
          ...prev,
          progress: 100,
          statusMessage: "Export selesai! File ZIP terdownload.",
          isRunning: false,
        }));

        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Export gagal";
        setProgress((prev) => ({
          ...prev,
          progress: 0,
          error: errorMessage,
          isRunning: false,
        }));
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  return {
    progress,
    generateStep,
    previewAudio,
    generateAll,
    resetProgress,
    exportProject,
  };
}
