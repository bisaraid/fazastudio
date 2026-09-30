"use client";
import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/** Bangun URL proxy (audio/video) untuk pemutaran di browser. */
export function proxyUrl(route: string, target: string): string {
  return `/${route}?url=${encodeURIComponent(target)}`;
}

/** Format detik → m:ss */
export function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

/** Bangun Data URI untuk download file teks (SRT/VTT) sin server. */
export function makeDataUrl(content: string, mime: string): string {
  try {
    return `data:${mime};charset=utf-8,` + encodeURIComponent(content);
  } catch {
    return `data:${mime};charset=utf-8,`;
  }
}

/**
 * Seek bar dengan area sentuh ≥44px (D10) — dipakai audio & video.
 * Tap/klik di mana pun pada area 44px langsung melakukan seek, sehingga tetap
 * bisa dipakai di perangkat sentuh (tanpa hover). Bisa juga dioperasikan dengan
 * panah kiri/kanan pada keyboard.
 */
export function ProgressBar({
  value,
  duration,
  onSeek,
  label = "Posisi putar",
}: {
  value: number;
  duration: number;
  onSeek: (t: number) => void;
  label?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pct = duration > 0 ? Math.min(100, (value / duration) * 100) : 0;

  const seekFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || duration <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div className="flex h-11 w-full items-center">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(value) || 0}
        onClick={(e) => seekFromClientX(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            onSeek(Math.max(0, value - 5));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            onSeek(Math.min(duration || 0, value + 5));
          }
        }}
        className="relative h-1.5 w-full cursor-pointer rounded-full bg-muted-foreground/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-fuchsia-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Custom elegant video player (via proxy). */
export function VideoPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  return (
    <div className="group relative mx-auto w-full max-w-[26rem] overflow-hidden rounded-xl border bg-black">
      <video
        ref={ref}
        src={proxyUrl("api/video-proxy", src)}
        preload="metadata"
        className="aspect-[9/16] max-h-[70dvh] w-full object-contain"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(duration);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition-transform hover:scale-110">
            <Play className="ml-1 h-8 w-8" />
          </span>
        </button>
      )}
      {/* D10: kontrol selalu terlihat (perangkat sentuh tidak punya hover) */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-1 pt-2">
        <ProgressBar
          value={current}
          duration={duration}
          onSeek={(t) => {
            const el = ref.current;
            if (el) el.currentTime = t;
          }}
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-transform hover:scale-105"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <span className="text-xs tabular-nums text-white/90">
            {fmtTime(current)} / {duration > 0 ? fmtTime(duration) : "--:--"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Custom audio player (via proxy untuk bypas CORS). */
export function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
      <audio
        ref={ref}
        src={proxyUrl("api/audio-proxy", src)}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <ProgressBar
        value={current}
        duration={duration}
        onSeek={(t) => {
          const el = ref.current;
          if (el) el.currentTime = t;
        }}
      />
      <div className="flex min-w-[7rem] shrink-0 items-center justify-end gap-1 text-xs tabular-nums text-muted-foreground">
        <span>{fmtTime(current)}</span>
        <span>/</span>
        <span>{duration > 0 ? fmtTime(duration) : "--:--"}</span>
      </div>
    </div>
  );
}