"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, Play, Pause, Video } from "lucide-react";
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
    <div className="space-y-4">
      {/* Audio hidden untuk scrubber sync */}
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} className="hidden" />
      )}

      {/* ===== TRACK FOOTAGE ===== */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-muted-foreground">Track Footage (per scene)</h4>
          <Badge variant="outline">{scenes.length} scene</Badge>
        </div>
        <div className="space-y-2">
          {scenes.map((scene, i) => {
            const footage = sceneFootage[scene.id];
            const options = footageOptions[scene.id] || [];
            return (
              <div key={scene.id} className="rounded-lg border border-border p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{scene.heading}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {scene.duration}s • {footage ? footage.query : "Belum ada footage"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleFetchFootage(scene)}
                    disabled={loadingSceneId === scene.id}
                    className="gap-1 shrink-0"
                  >
                    {loadingSceneId === scene.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Pilih Footage
                  </Button>
                </div>

                {/* Opsi footage */}
                {options.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {options.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => handleSelectFootage(scene.id, f)}
                        className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                          sceneFootage[scene.id]?.id === f.id
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border hover:border-primary/50"
                        }`}
                        title={f.query}
                      >
                        {f.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.thumbnail} alt={f.query} className="w-full h-full object-cover" />
                        )}
                        {sceneFootage[scene.id]?.id === f.id && (
                          <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                            <CheckCircle2 className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== TRACK SUBTITLE ===== */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-muted-foreground">Track Subtitle</h4>
          <Badge variant="outline">{segments.length} cue</Badge>
        </div>
        <div className="relative h-16 rounded-lg border border-border bg-muted/30 overflow-hidden">
          {segments.map((seg: any, i: number) => {
            const start = seg.startTime ?? seg.start ?? 0;
            const end = seg.endTime ?? seg.end ?? 0;
            const left = (start / totalDuration) * 100;
            const width = Math.max(1, ((end - start) / totalDuration) * 100);
            return (
              <div
                key={i}
                className="absolute top-1 bottom-1 rounded bg-primary/20 border border-primary/40 flex items-center justify-center overflow-hidden"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={seg.text}
              >
                <span className="text-[10px] px-1 truncate">{seg.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== SCRUBBER / PLAYHEAD ===== */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={togglePlay} disabled={!audioUrl}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <input
            type="range"
            min="0"
            max={totalDuration}
            step="0.1"
            value={playhead}
            onChange={handleSeek}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground shrink-0">
            {playhead.toFixed(1)}s / {totalDuration.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* ===== RENDER ===== */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleRender} disabled={isGenerating} className="gap-2">
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Merender... {Math.round(progress)}%
            </>
          ) : (
            <>
              <Video className="h-4 w-4" />
              Render Video (per scene)
            </>
          )}
        </Button>
      </div>
    </div>
  );
}