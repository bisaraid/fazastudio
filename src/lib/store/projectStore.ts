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
} from "@/lib/types";
import { generateId } from "@/lib/utils";

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
  advanceStep: (step: PipelineStep) => void;
  resetWizardForm: () => void;
  updateWizardForm: (data: Partial<WizardFormData>) => void;
  deleteProject: (projectId: string) => void;
}

const DEFAULT_WIZARD_FORM: WizardFormData = {
  genre: "edukasi",
  customGenre: undefined,
  topic: "",
  tone: "kasual",
  targetDuration: 60,
  platform: "tiktok",
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
    genre: (row.category_id ? "custom" : "edukasi") as any,
    topic: row.title || "",
    tone: "kasual",
    targetDuration: 60,
    platform: "tiktok",
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
    audio: row.audio_url ? { id: row.id, url: row.audio_url, duration: 0, voiceName: "Auto", language: "id-ID", speed: 1.0, emotion: "netral" } : undefined,
    subtitle: row.subtitle_url
      ? {
          id: row.id,
          entries: [],
          segments: [],
          style: { fontSize: 24, color: "#FFFFFF", position: "bottom" },
          srtContent: "",
          vttContent: "",
          language: "id-ID",
          // URL subtitle dari DB — penting untuk generate-video.
          url: row.subtitle_url,
        }
      : undefined,
    video: row.video_url ? { id: row.id, url: row.video_url, duration: 0, format: "mp4" } : undefined,
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
      genre: formData.genre,
      customGenre: formData.customGenre,
      topic: formData.topic,
      tone: formData.tone,
      targetDuration: formData.targetDuration,
      platform: formData.platform,
      mode: formData.mode,
      status: "draft",
      currentStep: "script",
      steps: createInitialSteps(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Simpan ke Supabase via API
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
      if (json.success && json.data) {
        newProject.id = json.data.id;
        newProject.createdAt = json.data.created_at;
        newProject.updatedAt = json.data.updated_at;
      }
    } catch (error) {
      console.error("[projectStore] createProject error:", error);
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
      currentStep: "export" as PipelineStep,
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      currentProject: updatedProject,
      projects: state.projects.map((p) =>
        p.id === updatedProject.id ? updatedProject : p
      ),
    }));
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

  advanceStep: (step: PipelineStep) => {
    const { currentProject } = get();
    if (!currentProject) return;

    // Subtitle adalah dependency internal dari Video — bukan destination step.
    // UX final: Script → Audio → Video → Export.
    const stepOrder: PipelineStep[] = ["script", "audio", "video", "export"];
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

  deleteProject: (projectId: string) => {
    const { currentProject } = get();
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== projectId),
      currentProject: currentProject?.id === projectId ? null : currentProject,
    }));
  },
}));