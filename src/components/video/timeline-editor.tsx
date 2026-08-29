"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, Play, Pause, Video, ChevronDown } from "lucide-react";
import { useProjectStore } from "@/lib/store/projectStore";
import { FootageOption, Scene } from "@/lib/types";

/**
 * Timeline Editor — komposisi visual per scene.
 *
 * Menampilkan:
 * - Track Footage: satu blok per scene (dari script.scenes), tiap scene bisa
 *   dipilih footage-nya sendiri (dari /api/footage dengan query scene.visualPrompt).
 * - Track Subtitle: blok-blok cue subtitle (1-3 kata) sejajar dengan timeline.
 * - Scrubber/playhead: preview sinkron antara footage + audio + subtitle.
 *
 * Render mengirim daftar scene + footage per scene ke /api/generate-video
 * untuk di-concat via FFmpeg (bukan satu clip loop).
 */
export function TimelineEditor({
  project,
  isGenerating,
  progress,
  onRender,
}: {
  project: any;
  isGenerating: boolean;
  progress: number;
  onRender: (sceneFootage: { sceneId: string; videoUrl: string }[]) => void;
}) {
  const scenes: Scene[] = project?.script?.scenes || [];
  const segments = project?.subtitle?.segments || [];
  const audioUrl = project?.audio?.url || "";

  // Footage per scene: { sceneId: FootageOption }
  const [sceneFootage, setSceneFootage] = useState<Record<string, FootageOption>>({});
  // Opsi footage per scene: { sceneId: FootageOption[] }
  const [footageOptions, setFootageOptions] = useState<Record<string, FootageOption[]>>({});
  const [loadingSceneId, setLoadingSceneId] = useState<string | null>(null);
  // Expand/collapse opsi footage per scene (default: collapse semua, hemat ruang).
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
  // Collapsed seluruh scene footage picker di belakang satu toggle (default hidden).
  const [isFootageOpen, setIsFootageOpen] = useState(false);
  // Thumbnail yang gagal dimuat → ditampilkan placeholder (supaya grid tetap visual).
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(new Set());
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Total durasi = jumlah durasi semua scene
  const totalDuration = scenes.reduce((acc, s) => acc + (s.duration || 0), 0) || 1;

  // Inisialisasi footage dari scene yang sudah punya footage
  useEffect(() => {
    const initial: Record<string, FootageOption> = {};
    scenes.forEach((s) => {
      if (s.footage?.videoUrl) {
        initial[s.id] = s.footage;
      }
    });
    setSceneFootage(initial);
  }, [scenes]);

  // Playhead sync dengan audio
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTimeUpdate = () => setPlayhead(el.currentTime);
    const onEnded = () => setIsPlaying(false);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setPlayhead(t);
    if (audioRef.current) {
      audioRef.current.currentTime = t;
    }
  };

  const handleFetchFootage = async (scene: Scene) => {
    setLoadingSceneId(scene.id);
    try {
      const query = scene.visualPrompt || project?.topic || "";
      const res = await fetch("/api/footage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, genre: project?.genre, perPage: 4 }),
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setFootageOptions((prev) => ({ ...prev, [scene.id]: json.data }));
      }
    } catch (err) {
      console.error("[TimelineEditor] Fetch footage gagal:", err);
    } finally {
      setLoadingSceneId(null);
    }
  };

  // Batch: prefetch opsi footage untuk SEMUA scene sekaligus (backend-driven).
  // User tinggal pilih thumbnail — tidak perlu klik "Cari Footage" per scene.
  const handleBatchFetchFootage = async () => {
    const targets = scenes.filter((s) => !footageOptions[s.id] || footageOptions[s.id].length === 0);
    if (targets.length === 0) return;

    setLoadingSceneId("__batch__");
    try {
      const payload = targets.map((s) => ({
        sceneId: s.id,
        query: s.visualPrompt || project?.topic || "",
        genre: project?.genre,
      }));
      const res = await fetch("/api/footage/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes: payload, perPage: 4 }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setFootageOptions((prev) => ({ ...prev, ...json.data }));
        // Auto-expand scene PERTAMA yang punya opsi, agar thumbnail langsung terlihat.
        if (!expandedSceneId) {
          const first = Object.keys(json.data).find((k) => (json.data[k] || []).length > 0);
          if (first) setExpandedSceneId(first);
        }
      } else {
        console.warn("[TimelineEditor] Batch footage gagal:", json.error);
      }
    } catch (err) {
      console.error("[TimelineEditor] Batch footage error:", err);
    } finally {
      setLoadingSceneId(null);
    }
  };

  // Auto prefetch saat scene tersedia (agar user langsung lihat thumbnail).
  useEffect(() => {
    if (scenes.length > 0) {
      handleBatchFetchFootage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes.length]);

  const handleSelectFootage = (sceneId: string, footage: FootageOption) => {
    setSceneFootage((prev) => ({ ...prev, [sceneId]: footage }));
    // Simpan ke store (perluas scene.footage)
    const updatedScenes = scenes.map((s) =>
      s.id === sceneId ? { ...s, footage } : s
    );
    if (project?.script) {
      useProjectStore.getState().setScriptResult({
        ...project.script,
        scenes: updatedScenes,
      });
    }
  };

  const handleRender = () => {
    const sceneFootageList = scenes
      .map((s) => {
        const f = sceneFootage[s.id];
        return f?.videoUrl ? { sceneId: s.id, videoUrl: f.videoUrl } : null;
      })
      .filter(Boolean) as { sceneId: string; videoUrl: string }[];
    onRender(sceneFootageList);
  };

  // Hitung offset kumulatif tiap scene untuk posisi di timeline
  let cumulative = 0;
  const sceneOffsets = scenes.map((s) => {
    const offset = cumulative;
    cumulative += s.duration || 0;
    return offset;
  });

  return (
    <div className="space-y-3">
      {/* Audio hidden (kompatibilitas) */}
      {audioUrl && (<audio ref={audioRef} src={audioUrl} className="hidden" />)}

      {/* Toggle Kustomisasi Footage (collapsed by default) */}
      <button
        type="button"
        onClick={() => setIsFootageOpen((v) => !v)}
        className="inline-flex min-h-[44px] items-center gap-2 py-2 text-sm font-medium text-primary hover:underline"
      >
        <span>🎬 Kustomisasi Footage</span>
        <span className={`text-muted-foreground transform transition-transform ${isFootageOpen ? "rotate-180" : ""}`}>
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>

      {isFootageOpen && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">Pilih footage per scene</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBatchFetchFootage}
              disabled={loadingSceneId === "__batch__"}
              className="gap-1 shrink-0"
            >
              {loadingSceneId === "__batch__" ? (<Loader2 className="h-3.5 w-3.5 animate-spin" />) : (<RefreshCw className="h-3.5 w-3.5" />)}
              Muat Ulang Semua
            </Button>
          </div>

          <div className="space-y-2">
            {scenes.map((scene, i) => {
              const footage = sceneFootage[scene.id];
              const options = footageOptions[scene.id] || [];
              const expanded = expandedSceneId === scene.id;
              return (
                <div key={scene.id} className="rounded-lg border border-border p-2">
                  <button
                    type="button"
                    className="flex w-full min-h-[44px] items-center gap-2 text-left"
                    onClick={() => setExpandedSceneId(expanded ? null : scene.id)}
                  >
                    <span className="text-xs text-muted-foreground w-6 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{scene.heading}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {scene.duration} detik • {footage ? "✓ Footage dipilih" : "Ketuk untuk pilih footage"}
                      </p>
                    </div>
                    <span className={`text-muted-foreground transform transition-transform ${expanded ? "rotate-180" : ""}`}>
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>

                  {expanded && (
                    <div className="mt-2">
                      {options.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {options.map((f) => (
                            <button
                              key={f.id}
                              onClick={() => handleSelectFootage(scene.id, f)}
                              className={`relative aspect-video rounded-lg overflow-hidden border-2 bg-muted transition-all ${sceneFootage[scene.id]?.id === f.id ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
                            >
                              {f.thumbnail && !brokenThumbs.has(f.id) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={f.thumbnail}
                                  alt="Pilihan footage"
                                  className="w-full h-full object-cover"
                                  onError={() => { setBrokenThumbs((prev) => new Set(prev).add(f.id)); }}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="absolute inset-0 bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
                                  <Video className="h-5 w-5 text-white/70" />
                                </div>
                              )}
                              {sceneFootage[scene.id]?.id === f.id && (
                                <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                                  <CheckCircle2 className="h-3 w-3" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground py-2">
                          {loadingSceneId === "__batch__" || loadingSceneId === scene.id
                            ? "Memuat opsi footage..."
                            : "Belum ada opsi. Gunakan Muat Ulang Semua."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
