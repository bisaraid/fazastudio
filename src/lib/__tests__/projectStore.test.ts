import { test, expect, describe, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role";
  process.env.SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_ANON_KEY = "fake-anon";
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { useProjectStore } from "@/lib/store/projectStore";
import type { Project } from "@/lib/types";

function jsonOk(body: any) {
  return { ok: true, status: 200, json: async () => body };
}

const VALID_ROW = {
  id: "proj-1",
  title: "Cara Belajar Efektif",
  genre_slug: "edukasi",
  platform: "tiktok",
  target_duration: 60,
  script: "{\"id\":\"s1\",\"scenes\":[],\"fullScript\":\"a\",\"estimatedDuration\":5,\"wordCount\":1}",
  audio_url: null,
  subtitle_url: null,
  video_url: null,
  status: "draft",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

describe("projectStore - loadProjects (anti-crash)", () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [], currentProject: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("row valid ter-map dengan benar", async () => {
    mockFetch.mockResolvedValue(jsonOk({ success: true, data: [VALID_ROW] }));
    await useProjectStore.getState().loadProjects();

    const projects = useProjectStore.getState().projects;
    const find = "proj-1";
    const proj = projects.find(function (it) { return it.id === find; })!;
    expect(projects).toHaveLength(1);
    expect(proj.id).toBe("proj-1");
    expect(proj.genre).toBe("edukasi");
    expect(proj.platform).toBe("tiktok");
    expect(proj.targetDuration).toBe(60);
    expect(proj.status).toBe("processing");
    expect(proj.steps.script).toBe("done");
  });

  test("row tanpa id di-skip - tidak crash", async () => {
    const bad0 = { ...VALID_ROW, id: null };
    const bad1 = { ...VALID_ROW, id: "" };
    mockFetch.mockResolvedValue(jsonOk({ success: true, data: [bad0, bad1, VALID_ROW] }));
    await useProjectStore.getState().loadProjects();

    const projects = useProjectStore.getState().projects;
    const find = "proj-1";
    const proj0 = projects.find(function (it) { return it.id === find; })!;
    expect(projects).toHaveLength(1);
    expect(proj0.id).toBe("proj-1");
  });

  test("script JSON rusak - script undefined", async () => {
    const badScript = { ...VALID_ROW, script: "{invalid json" };
    mockFetch.mockResolvedValue(jsonOk({ success: true, data: [badScript] }));
    await useProjectStore.getState().loadProjects();

    const projects = useProjectStore.getState().projects;
    const find = "proj-1";
    const proj = projects.find(function (it) { return it.id === find; })!;
    expect(projects).toHaveLength(1);
    expect(proj.script).toBe(undefined);
    expect(proj.steps.script).toBe("pending");
  });

  test("genre/platform invalid - fallback kosong", async () => {
    const bad = { ...VALID_ROW, genre_slug: "hacker", platform: "myspace" };
    mockFetch.mockResolvedValue(jsonOk({ success: true, data: [bad] }));
    await useProjectStore.getState().loadProjects();

    const projects = useProjectStore.getState().projects;
    const find = "proj-1";
    const proj = projects.find(function (it) { return it.id === find; })!;
    expect(projects).toHaveLength(1);
    expect(proj.genre).toBe("");
    expect(proj.platform).toBe("");
  });

  test("API error - tidak throw", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await useProjectStore.getState().loadProjects();

    expect(useProjectStore.getState().projects).toHaveLength(0);
  });
});

describe("projectStore - 5A invalidasi hilir", () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [], currentProject: null });
    mockFetch.mockResolvedValue(jsonOk({ success: true }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function fullProject(): Project {
    return {
      id: "p-1",
      title: "Judul",
      genre: "edukasi",
      topic: "topik",
      tone: "kasual",
      targetDuration: 60,
      platform: "tiktok",
      mode: "step-by-step",
      status: "completed",
      currentStep: "video",
      steps: { script: "done", audio: "done", subtitle: "done", video: "done", export: "pending" },
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      script: { id: "s1", title: "t", scenes: [], fullScript: "f", estimatedDuration: 5, wordCount: 1 },
      audio: { id: "a1", url: "a.mp3", duration: 5, voiceName: "Sari", language: "id-ID", speed: 1, emotion: "netral" },
      subtitle: {
        id: "sub1",
        entries: [],
        segments: [],
        style: { fontSize: 24, color: "#fff", position: "bottom" },
        srtContent: "LAMA",
        vttContent: "LAMA",
        language: "id",
      },
      video: { id: "v1", url: "v.mp4", duration: 5, format: "mp4" },
      videoStoragePlan: "free",
      videoExpiresAt: "2026-09-02T00:00:00Z",
      metadata: { subtitleSrt: "LAMA", currentStep: "video" },
    };
  }

  const NEW_SCRIPT = {
    id: "s-new",
    title: "Baru",
    scenes: [],
    fullScript: "f",
    estimatedDuration: 5,
    wordCount: 1,
  };

  function lastPatchBody() {
    const calls = mockFetch.mock.calls.filter((c) => c[0] === "/api/projects" && c[1]?.method === "PATCH");
    const last = calls[calls.length - 1];
    expect(last, "PATCH /api/projects tidak terkirim").toBeTruthy();
    return JSON.parse(last[1].body);
  }

  test("setScriptResult → media hilir dihapus + clearMedia [audio,subtitle,video] + status draft", () => {
    const proj = fullProject();
    useProjectStore.setState({ projects: [proj], currentProject: proj });

    useProjectStore.getState().setScriptResult(NEW_SCRIPT as never);

    const state = useProjectStore.getState();
    const cur = state.currentProject!;
    expect(cur.script?.id).toBe("s-new");
    expect(cur.audio).toBeUndefined();
    expect(cur.subtitle).toBeUndefined();
    expect(cur.video).toBeUndefined();
    expect(cur.steps.audio).toBe("pending");
    expect(cur.steps.video).toBe("pending");
    expect(cur.status).toBe("draft");
    expect(cur.metadata?.subtitleSrt).toBeUndefined();
    // daftar project ikut ter-update (bukan hanya currentProject)
    expect(state.projects[0].video).toBeUndefined();

    const body = lastPatchBody();
    expect(body.projectId).toBe("p-1");
    expect(body.clearMedia).toEqual(["audio", "subtitle", "video"]);
    expect(body.status).toBe("draft");
  });

  test("setAudioResult → subtitle+video direset, audio BARU tetap, script tidak tersentuh", () => {
    const proj = fullProject();
    useProjectStore.setState({ projects: [proj], currentProject: proj });

    useProjectStore.getState().setAudioResult({
      id: "a-new",
      url: "u.mp3",
      duration: 1,
      voiceName: "Sari",
      language: "id-ID",
      speed: 1,
      emotion: "netral",
    });

    const cur = useProjectStore.getState().currentProject!;
    expect(cur.audio?.id).toBe("a-new");
    expect(cur.subtitle).toBeUndefined();
    expect(cur.video).toBeUndefined();
    expect(cur.steps.script).toBe("done");
    expect(cur.steps.subtitle).toBe("pending");

    expect(lastPatchBody().clearMedia).toEqual(["subtitle", "video"]);
  });

  test("setSubtitleResult → video direset; subtitle + subtitleSrt BARU tersimpan", () => {
    const proj = fullProject();
    useProjectStore.setState({ projects: [proj], currentProject: proj });

    useProjectStore.getState().setSubtitleResult({
      id: "sub-new",
      entries: [],
      segments: [],
      style: { fontSize: 24, color: "#fff", position: "bottom" },
      srtContent: "BARU",
      vttContent: "BARU",
      language: "id",
    });

    const cur = useProjectStore.getState().currentProject!;
    expect(cur.subtitle?.id).toBe("sub-new");
    expect(cur.video).toBeUndefined();
    expect(cur.audio).toBeDefined();
    expect(cur.steps.video).toBe("pending");
    expect(cur.metadata?.subtitleSrt).toBe("BARU");

    const body = lastPatchBody();
    expect(body.clearMedia).toEqual(["video"]);
    expect(body.metadata.subtitleSrt).toBe("BARU");
  });

  test("media sudah kosong → invalidasi tetap jalan tanpa error (idempoten)", () => {
    const proj = { ...fullProject(), audio: undefined, subtitle: undefined, video: undefined };
    useProjectStore.setState({ projects: [proj], currentProject: proj });

    expect(() => useProjectStore.getState().setScriptResult(NEW_SCRIPT as never)).not.toThrow();

    expect(useProjectStore.getState().currentProject?.audio).toBeUndefined();
    expect(lastPatchBody().clearMedia).toEqual(["audio", "subtitle", "video"]);
  });
});
