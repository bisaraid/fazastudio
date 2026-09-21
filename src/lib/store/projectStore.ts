import { create } from "zustand";
import {
  Project,
  WizardFormData,
  ScriptResult,
  AudioResult,
  SubtitleResult,
  VideoResult,
  PipelineStep,
  StepStatus,
  FootageOption,
  Genre,
  Platform,
  ProjectMetadata,
} from "@/lib/types";
import { generateId } from "@/lib/utils";
import { providerLabel } from "@/lib/constants";

interface ProjectState {
  // Projects list
  projects: Project[];
  currentProject: Project | null;

  // Wizard form
  wizardForm: WizardFormData;

  // Actions
  loadProjects: () => Promise<void>;
  appendProjects: (offset: number, limit: number) => Promise<number>;
  createProject: (formData: WizardFormData, id?: string) => Promise<Project>;
  setCurrentProject: (projectId: string) => void;
  updateProjectStep: (step: PipelineStep, status: StepStatus) => void;
  setScriptResult: (result: ScriptResult) => void;
  setAudioResult: (result: AudioResult) => void;
  setSubtitleResult: (result: SubtitleResult) => void;
  setVideoResult: (result: VideoResult) => void;
  setFootageResult: (footage: FootageOption) => void;
  updateProjectStatus: (status: Project["status"]) => void;
  updateProjectMeta: (meta: Partial<Pick<Project, "platform" | "targetDuration">>) => void;
  updateProjectSetup: (data: {
    genre: Genre;
    customGenre?: string;
    topic: string;
    platform: Platform;
    targetDuration: number;
  }) => Promise<void>;
  /** Merge + persist state pipeline (kolom projects.metadata JSONB). */
  updateProjectMetadata: (patch: Partial<ProjectMetadata>) => Promise<void>;
  advanceStep: (step: PipelineStep) => void;
  resetWizardForm: () => void;
  updateWizardForm: (data: Partial<WizardFormData>) => void;
  deleteProject: (projectId: string) => Promise<void>;
}

const DEFAULT_WIZARD_FORM: WizardFormData = {
  genre: "",
  customGenre: undefined,
  topic: "",
  tone: "kasual",
  targetDuration: 0,
  platform: "",
  mode: "step-by-step",
  voiceName: "Sari",
  voiceLanguage: "id-ID",
  voiceSpeed: 1.0,
  voiceEmotion: "netral",
  visualStyle: "stock",
};

const createInitialSteps = () => ({
  script: "pending" as StepStatus,
  audio: "pending" as StepStatus,
  subtitle: "pending" as StepStatus,
  video: "pending" as StepStatus,
  export: "pending" as StepStatus,
});

// ============================================================
// Safe parsing & normalisasi (Sesi 3 fix — anti-crash dashboard)
// ============================================================

/** Daftar Genre valid (sinkron dengen lib/types.ts) */
const VALID_GENRES = new Set<string>([
  "horor", "misteri", "psikologi", "romance", "motivasi",
  "edukasi", "affiliate", "sejarah", "keuangan", "custom",
]);

/** Daftar Platform valid (sinkron dengen lib/types.ts) */
const VALID_PLATFORMS = new Set<string>([
  "tiktok", "youtube", "reels", "podcast", "shopee",
]);

/** Parse + validasi shape script JSON. Return undefined jika tidak valid. */
function safeParseScript(raw: unknown): ScriptResult | undefined {
  if (!raw) return undefined;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return undefined;
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.scenes)) return undefined;
    return parsed as ScriptResult;

  } catch {
    return undefined;
  }
}

/** Parse kolom metadata (JSONB). Return undefined jika tidak valid/kosong. */
function safeParseMetadata(raw: unknown): ProjectMetadata | undefined {
  if (!raw) return undefined;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (obj && typeof obj === "object") return obj as ProjectMetadata;
    return undefined;
  } catch {
    return undefined;
  }
}

/** Normalisasi genre DB → Genre valid; "" jika invalid. */
function normalizeGenre(raw: unknown): Genre | "" {
  const v = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  return (VALID_GENRES.has(v) ? (v as Genre) : "");
}

/** Normalisasi platform DB → Platform valid; "" jika invalid. */
function normalizePlatform(raw: unknown): Platform | "" {
  const v = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  return (VALID_PLATFORMS.has(v) ? (v as Platform) : "");
}

/** Ambil angka aman dari nilai DB (fallback 0). */
function toFiniteNumber(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Map satu DB row → Project; return NULL untuk row malformed (id hilang /
 * shape rusak) — pemanggil wajib filter. Tidak pernah throw.	
 */
function mapDbRowToProjectSafe(row: any): Project | null {
  // id wajib — tanpa id, project tidak bisa diidentifikasi/dioperasikan.

  if (!row || typeof row !== "object" || typeof row.id !== "string" || row.id.trim() === "") {
    console.warn("[projectStore] Row tanpa id valid di-skip dari dashboard");
    return null;
  }

  const script = safeParseScript(row.script);
  const nowIso = new Date().toISOString();
  const title = typeof row.title === "string" ? row.title : "";
  const metadata = safeParseMetadata(row.metadata);

  return {
    id: row.id,
    title,
    genre: (normalizeGenre(row.genre_slug) as Genre),
    topic: title,
    tone: "kasual",
    targetDuration: toFiniteNumber(row.target_duration),
    platform: (normalizePlatform(row.platform) as Platform),
    mode: "step-by-step",
    // Status dihitung (derive) dari data konten yang nyata — bukan dari kolom
    // "status" yang mudah basi/lupa di-update. Ini membuat dashboard selalu
    // sinkron dengan progress step.
    //   - ada video            → "completed"
    //   - ada script/audio     → "processing"
    //   - belum ada apa-apa    → "draft"
    // Aturan: "completed" DB tetap dihormati sebagai override, tapi jika ada
    // video, otomatis dianggap selesai.
    status: (() => {
      const derived =
        row.video_url ? "completed"
        : script || row.audio_url ? "processing"
        : "draft";
      if (row.status === "completed" && derived !== "draft") return "completed";
      return derived as Project["status"];
    })(),
    currentStep: (metadata?.currentStep as PipelineStep) || "script",
    metadata,
    // Derive step status dari data DB — jangan reset semua ke "pending".
    // Jika data sudah ada di DB, step dianggap "done".
    steps: {
      script: script ? "done" : "pending",
      audio: row.audio_url ? "done" : "pending",
      subtitle: row.subtitle_url ? "done" : "pending",
      video: row.video_url ? "done" : "pending",
      export: "pending",
    },
    createdAt: typeof row.created_at === "string" ? row.created_at : nowIso,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : nowIso,
    script,
    audio: row.audio_url
      ? {
          id: row.id,
          url: row.audio_url,
          duration: 0,
          voiceName: providerLabel(row.audio_provider),
          provider: (row.audio_provider || "google") as AudioResult["provider"],
          language: "id-ID",
          speed: toFiniteNumber(row.audio_speed) || 1.0,
          emotion: row.audio_emotion || "netral",
        }
      : undefined,
    subtitle: row.subtitle_url
      ? {
          id: row.id,
          entries: [],
          segments: [],
          style: {
            fontSize: 28,
            color: "#FFD700",
            position: "bottom",
            strokeColor: "#000000",
            strokeWidth: 2,
          },
          srtContent: metadata?.subtitleSrt || "",
          vttContent: metadata?.subtitleSrt || "",
          language: "id-ID",
          // URL subtitle dari DB — penting untuk generate-video.
          url: row.subtitle_url,
        }
      : undefined,
    video: row.video_url ? { id: row.id, url: row.video_url, duration: 0, format: "mp4" } : undefined,
    videoStoragePlan: (row.video_storage_plan as "free" | "premium") ?? undefined,
    videoExpiresAt: row.video_expires_at ?? null,
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  wizardForm: { ...DEFAULT_WIZARD_FORM },

  loadProjects: async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        console.warn(`[projectStore] loadProjects HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const projects = json.data
          .map(mapDbRowToProjectSafe)
          .filter((p: Project | null): p is Project => p !== null);
        set({ projects });
      }
    } catch (error) {
      console.error("[projectStore] loadProjects error:", error);
    }
  },
    appendProjects: async (offset: number, limit: number) => {
    try {
      const res = await fetch("/api/projects?limit=" + limit + "&offset=" + offset);
      if (res.ok === false) return 0;
      const json = await res.json();
      const incoming = (json.success && Array.isArray(json.data)) ? json.data.map(mapDbRowToProjectSafe).filter((p: Project | null): p is Project=> p !== null) : [];
      const merged = get().projects.slice();
      const seen = new Set();
      for (const p of incoming) {
        if (seen.has(p.id) === false) { seen.add(p.id); merged.push(p); }
      }
      set({ projects: merged });
      return incoming.length;

    } catch (error) {      console.error("[projectStore] appendProjects error:", error);
      return 0;    }  },

  createProject: async (formData: WizardFormData, id?: string) => {
    const clientId = id && id.trim() ? id.trim() : generateId();
    const newProject: Project = {
      id: clientId,
      title: formData.topic,
      genre: formData.genre as Genre,
      customGenre: formData.customGenre,
      topic: formData.topic,
      tone: formData.tone,
      targetDuration: formData.targetDuration,
      platform: formData.platform as Platform,
      mode: formData.mode,
      status: "draft",
      currentStep: "script",
      steps: createInitialSteps(),
      metadata: { currentStep: "script" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Optimistisch: zet project DIRECT in de store (vóór de POST klaar is) zodat
    // de editor het meteen vindt op de immediate redirect.
    const { projects } = get();
    set({ projects: [newProject, ...projects], currentProject: newProject });

    // Simpan ke Supabase via API — client bepaalt het definitieve ID (Opsi A).
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: clientId,
          title: formData.topic,
          topic: formData.topic,
          genre: formData.genre,
          status: "draft",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        // Gagal menyimpan di DB → lempar error agar UI bisa menampilkan pesan.
        throw new Error(json?.error || `Gagal menyimpan project (HTTP ${res.status})`);
      }
      // ID client = server ID (server accept client-id). Adopt server timestamps.
      const createdAt = (json.data?.created_at as string) || newProject.createdAt;
      const updatedAt = (json.data?.updated_at as string) || newProject.updatedAt;
      newProject.createdAt = createdAt;
      newProject.updatedAt = updatedAt;
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === clientId ? { ...p, createdAt, updatedAt } : p
        ),
        currentProject:
          state.currentProject?.id === clientId
            ? { ...state.currentProject, createdAt, updatedAt }
            : state.currentProject,
      }));
      return newProject;
    } catch (error) {
      console.error("[projectStore] createProject error:", error);
      // Rollback: hapus project optimist yang ternyata tidak ter-persist.
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== clientId),
        currentProject: state.currentProject?.id === clientId ? null : state.currentProject,
      }));
      throw error instanceof Error
        ? error
        : new Error("Gagal membuat project. Coba lagi.");
    }
  },

  setCurrentProject: (projectId: string) => {
    const { projects } = get();
    const project = projects.find((p) => p.id === projectId) || null;
    set({ currentProject: project });
  },

  updateProjectStep: (step: PipelineStep, status: StepStatus) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const updatedProject = {
      ...currentProject,
      steps: { ...currentProject.steps, [step]: status },
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
    }));
  },

  setScriptResult: (result: ScriptResult) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const updatedProject = {
      ...currentProject,
      script: result,
      steps: { ...currentProject.steps, script: "done" as StepStatus },
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
    }));
  },

  setAudioResult: (result: AudioResult) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const updatedProject = {
      ...currentProject,
      audio: result,
      steps: { ...currentProject.steps, audio: "done" as StepStatus },
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
    }));
  },

  setSubtitleResult: (result: SubtitleResult) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const updatedProject = {
      ...currentProject,
      subtitle: result,
      steps: { ...currentProject.steps, subtitle: "done" as StepStatus },
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
    }));

    // Persist subtitle srtContent → metadata (agar export SRT/VTT tidak hilang saat reload).
    if (result?.srtContent) {
      const metadata: ProjectMetadata = {
        ...(currentProject.metadata || {}),
        subtitleSrt: result.srtContent,
      };
      fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: updatedProject.id, metadata }),
      }).catch((err) =>
        console.warn("[projectStore] setSubtitleResult persist metadata error:", err)
      );
    }
  },

  setVideoResult: (result: VideoResult) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const updatedProject = {
      ...currentProject,
      video: result,
      steps: { ...currentProject.steps, video: "done" as StepStatus },
      status: "completed" as const,
      currentStep: "video" as PipelineStep,
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
    }));

    // Persist status "completed" ke DB agar dashboard menampilkan "Selesai" benar.
    fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: updatedProject.id,
        status: "completed",
      }),
    }).catch((err) =>
      console.warn("[projectStore] setVideoResult persist status error:", err)
    );
  },

  setFootageResult: (footage: FootageOption) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const updatedProject = {
      ...currentProject,
      footage,
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
    }));
  },

  updateProjectStatus: (status: Project["status"]) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const updatedProject = {
      ...currentProject,
      status,
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
    }));
  },

  updateProjectMeta: (meta) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const updatedProject = {
      ...currentProject,
      ...meta,
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
    }));
  },

  updateProjectSetup: async (data) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const topicChanged = data.topic?.trim() !== (currentProject.topic?.trim() ?? "");
    const updatedProject: Project = {
      ...currentProject,
      ...data,
      // Judul project mengikuti topic (agar kartu menampilkan judul yang terisi).
      title: data.topic || currentProject.title || "",
      customGenre: data.customGenre,
      metadata: topicChanged ? { ...(currentProject.metadata || {}), usedClosingIds: [] } : currentProject.metadata,
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
    }));

    // Persist setup konten ke database via PATCH /api/projects
    try {
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: updatedProject.id,
          genre: data.genre,
          platform: data.platform,
          targetDuration: data.targetDuration,
          title: data.topic,
        }),
      });

      if (!res.ok) {
        console.warn(
          `[projectStore] updateProjectSetup gagal persist (HTTP ${res.status})`
        );
      }
    } catch (error) {
      console.error("[projectStore] updateProjectSetup persist error:", error);
    }
  },

  updateProjectMetadata: async (patch: Partial<ProjectMetadata>) => {
    const { currentProject } = get();
    if (!currentProject) return;

    const merged: ProjectMetadata = { ...(currentProject.metadata || {}), ...patch };
    const updatedProject = {
      ...currentProject,
      metadata: merged,
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
    }));

    try {
      await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: updatedProject.id, metadata: merged }),
      });
    } catch (error) {
      console.warn("[projectStore] updateProjectMetadata persist error:", error);
    }
  },

  advanceStep: (step: PipelineStep) => {
    const { currentProject } = get();
    if (!currentProject) return;

    // Subtitle adalah dependency internal dari Video — bukan destination step.
    // UX final: Script → Audio → Video. Export sudah tidak jadi step UI.
    const stepOrder: PipelineStep[] = ["script", "audio", "video"];
    const currentIndex = stepOrder.indexOf(step);
    const nextStep = stepOrder[currentIndex + 1];

    if (nextStep) {
      const metadata: ProjectMetadata = {
        ...(currentProject.metadata || {}),
        currentStep: nextStep,
      };
      const updatedProject = {
        ...currentProject,
        currentStep: nextStep,
        metadata,
        updatedAt: new Date().toISOString(),
      };

      set((state) => ({
        currentProject: updatedProject,
        projects: state.projects.map((p) =>
          p.id === updatedProject.id ? updatedProject : p
        ),
      }));

      // Persist currentStep → metadata JSONB (agar reload resetting alur).
      fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: updatedProject.id, metadata }),
      }).catch((err) =>
        console.warn("[projectStore] advanceStep persist metadata error:", err)
      );
    }
  },

  resetWizardForm: () => {
    set({ wizardForm: { ...DEFAULT_WIZARD_FORM } });
  },

  updateWizardForm: (data: Partial<WizardFormData>) => {
    set((state) => ({
      wizardForm: { ...state.wizardForm, ...data },
    }));
  },

  deleteProject: async (projectId: string) => {
    const { currentProject } = get();

    // Optimistic update: hapus dari state lokal dulu agar UI langsung merespons.
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== projectId),
      currentProject: currentProject?.id === projectId ? null : currentProject,
    }));

    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        // Gagal hapus di DB → reload lagi agar UI tidak menipu (project tidak nyambung).
        console.error("[store] deleteProject gagal di API:", res.status);
        await get().loadProjects();
        throw new Error(`Gagal menghapus project (HTTP ${res.status})`);
      }
    } catch (err) {
      // Jaringan/error lain → reload agar state konsisten dengan DB.
      console.error("[store] deleteProject error:", err);
      await get().loadProjects();
      throw err instanceof Error ? err : new Error("Gagal menghapus project. Coba lagi.");
    }
  },
}));