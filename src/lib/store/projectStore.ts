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
  createProject: (formData: WizardFormData) => Promise<Project>;
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

// Map DB row → Project (ACS format)
function mapDbRowToProject(row: any): Project {
  let script: ScriptResult | undefined;
  if (row.script) {
    try {
      script = typeof row.script === "string" ? JSON.parse(row.script) : row.script;
    } catch {
      script = undefined;
    }
  }

  return {
    id: row.id,
    title: row.title || "",
    genre: (row.genre_slug || "") as any,
    topic: row.title || "",
    tone: "kasual",
    targetDuration: row.target_duration ?? 0,
    platform: (row.platform || "") as any,
    mode: "step-by-step",
    status: (row.status || "draft") as Project["status"],
    currentStep: "script",
    // Derive step status dari data DB — jangan reset semua ke "pending".
    // Jika data sudah ada di DB, step dianggap "done".
    steps: {
      script: row.script ? "done" : "pending",
      audio: row.audio_url ? "done" : "pending",
      subtitle: row.subtitle_url ? "done" : "pending",
      video: row.video_url ? "done" : "pending",
      export: "pending",
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    script,
    audio: row.audio_url
      ? {
          id: row.id,
          url: row.audio_url,
          duration: 0,
          voiceName: providerLabel(row.audio_provider),
          provider: (row.audio_provider || "google") as AudioResult["provider"],
          language: "id-ID",
          speed: row.audio_speed ?? 1.0,
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
          srtContent: "",
          vttContent: "",
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
        const projects = json.data.map(mapDbRowToProject);
        set({ projects });
      }
    } catch (error) {
      console.error("[projectStore] loadProjects error:", error);
    }
  },

  createProject: async (formData: WizardFormData) => {
    const newProject: Project = {
      id: generateId(),
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Simpan ke Supabase via API
    let persisted = false;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.topic,
          topic: formData.topic,
          genre: formData.genre,
          status: "draft",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        // Gagal menyimpan di DB → lempar error agar UI (tombol "Buat Konten Baru")
        // bisa menampilkan pesan, dan JANGAN tambahkan project palsu ke daftar.
        throw new Error(json?.error || `Gagal menyimpan project (HTTP ${res.status})`);
      }
      newProject.id = json.data.id;
      newProject.createdAt = json.data.created_at;
      newProject.updatedAt = json.data.updated_at;
      persisted = true;
    } catch (error) {
      console.error("[projectStore] createProject error:", error);
      throw error instanceof Error
        ? error
        : new Error("Gagal membuat project. Coba lagi.");
    }

    if (!persisted) {
      throw new Error("Gagal membuat project. Coba lagi.");
    }

    const { projects } = get();
    set({
      projects: [newProject, ...projects],
      currentProject: newProject,
    });

    return newProject;
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

    const updatedProject: Project = {
      ...currentProject,
      ...data,
      // Judul project mengikuti topic (agar kartu menampilkan judul yang terisi).
      title: data.topic || currentProject.title || "",
      customGenre: data.customGenre,
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

  advanceStep: (step: PipelineStep) => {
    const { currentProject } = get();
    if (!currentProject) return;

    // Subtitle adalah dependency internal dari Video — bukan destination step.
    // UX final: Script → Audio → Video. Export sudah tidak jadi step UI.
    const stepOrder: PipelineStep[] = ["script", "audio", "video"];
    const currentIndex = stepOrder.indexOf(step);
    const nextStep = stepOrder[currentIndex + 1];

    if (nextStep) {
      const updatedProject = {
        ...currentProject,
        currentStep: nextStep,
        updatedAt: new Date().toISOString(),
      };

      set((state) => ({
        currentProject: updatedProject,
        projects: state.projects.map((p) =>
          p.id === updatedProject.id ? updatedProject : p
        ),
      }));
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