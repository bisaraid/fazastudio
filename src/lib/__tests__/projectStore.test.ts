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
