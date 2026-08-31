"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProjectStore } from "@/lib/store/projectStore";
import { useUser } from "@/hooks/useUser";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { PricingPlans } from "@/components/pricing-plans";
import {
  Sparkles,
  ArrowRight,
  Loader2,
  Play,
  Pause,
  ChevronDown,
  Settings,
  LayoutDashboard,
  LogOut,
} from "lucide-react";

const CONTOH_AUDIO_SRC = "/audio/contoh-preview.mp3";

const CONTOH_SECTIONS = [
  {
    label: "Hook — bikin penasaran",
    text: "Pernah nggak kamu merasa sudah mencoba segalanya tapi hasilnya tetap biasa saja?",
  },
  {
    label: "Isi 1 — pola yang dipakai konten viral",
    text: "Hari ini kita akan lihat satu pola sederhana yang dipakai konten viral — kenapa beberapa video langsung ramai sementara yang lain sepi.",
  },
  {
    label: "Isi 2 — contoh nyata",
    text: "Coba perhatikan tiga konten terakhir yang kamu tonton sampai habis. Semuanya punya satu kesamaan: mereka langsung menyentuh masalahmu di 5 detik pertama.",
  },
  {
    label: "Penutup — call to action",
    text: "Terapkan satu langkah ini di konten berikutnya, dan bandingkan hasilnya.",
  },
];

function formatTime(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LandingPage() {
  const router = useRouter();
  const { createProject } = useProjectStore();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");

  // Audio preview contoh script
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCurrent, setAudioCurrent] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  // Auth-aware navbar
  const { user, loading } = useUser();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // abaikan — tetap arahkan ke /masuk
    }
    setShowUserMenu(false);
    router.push("/masuk");
  }, [loggingOut, router]);

  // Identitas akun: utamakan user_metadata (nama/avatar dari login Google/email),
  // fallback email, lalu inisial.
  const displayName =
    (user?.user_metadata?.full_name as string)?.trim() ||
    user?.user_metadata?.name ||
    user?.email ||
    "Akun";
  // Hanya anggap avatar valid jika benar berupa URL http(s) atau data URI.
  // Mencegah URL rusak/template dari metadata tampil sebagai gambar pecah.
  const rawAvatar =
    (user?.user_metadata?.avatar_url as string) ||
    (user?.user_metadata?.picture as string) ||
    "";
  const avatarUrl =
    /^(https?:\/\/|data:)/i.test(rawAvatar.trim()) ? rawAvatar.trim() : "";
  const [avatarError, setAvatarError] = useState(false);
  const initial = displayName.charAt(0).toUpperCase();

  const toggleAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => setAudioAvailable(false));
    } else {
      el.pause();
    }
  };

  // "Coba Gratis" → buat project anonim → langsung buka editor (alur conversion).
  const handleCobaGratis = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const project = await createProject({
        genre: "",
        customGenre: undefined,
        topic: topic.trim(),
        tone: "kasual",
        targetDuration: 0,
        platform: "",
        mode: "step-by-step",
        voiceName: "Sari",
        voiceLanguage: "id-ID",
        voiceSpeed: 1.0,
        voiceEmotion: "netral",
        visualStyle: "stock",
      });
      if (project?.id) router.push(`/konten/${project.id}`);
    } catch {
      setError("Gagal membuat sesi. Coba lagi.");
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 lg:px-8">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Faza Studio</span>
          </div>
          <div className="flex-1" />
          {loading ? null : user ? (
            <div className="relative flex items-center gap-2">
              <button
                onClick={() => {
                  setShowUserMenu((v) => !v);
                }}
                className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 transition-colors hover:bg-accent"
              >
                {avatarUrl && !avatarError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    onError={() => setAvatarError(true)}
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {initial}
                  </span>
                )}
                <span className="hidden max-w-[140px] truncate text-sm font-medium sm:inline">
                  {displayName}
                </span>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border bg-popover p-1 shadow-md">
                    <div className="border-b px-2 py-2">
                      <p className="truncate text-sm font-medium">{displayName}</p>
                      {user?.email && (
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        router.push("/beranda");
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        router.push("/pengaturan");
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Settings className="h-4 w-4" />
                      Pengaturan
                    </button>
                    <button
                      onClick={logout}
                      disabled={loggingOut}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-accent"
                    >
                      <LogOut className="h-4 w-4" />
                      {loggingOut ? "Keluar..." : "Keluar"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <nav className="hidden items-center gap-1 md:flex">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/harga">Harga</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/masuk">Masuk</Link>
                </Button>
              </nav>
              <Button size="sm" className="ml-2" asChild>
                <Link href="/daftar">Daftar</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 text-center lg:px-8 lg:pt-28">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          satu ide.
          <span className="block text-primary">satu konten.</span>
        </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm text-muted-foreground sm:text-base">
            AI yang meneliti, menulis dan membuat konten untukmu.
          </p>
        <div className="relative mx-auto mt-8 w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-sm">
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            disabled={creating}
            placeholder="Ceritakan ide kontenmu..."
            className="block w-full min-h-[132px] resize-none border-0 bg-transparent px-5 pt-4 pb-20 text-base leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-60"
          />
          <Button
            size="lg"
            onClick={handleCobaGratis}
            disabled={creating}
            className="absolute bottom-4 right-4 gap-2 text-white"
          >
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {creating ? "Menyiapkan…" : "Coba Gratis"}
            {!creating && <ArrowRight className="h-5 w-5" />}
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </section>
      {/* Bukti hasil */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto max-w-4xl px-4 py-16 lg:px-8">
        <div className="rounded-2xl border bg-card p-8 shadow-sm lg:p-10">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">Contoh script yang dihasilkan</h2>
            <p className="mt-3 text-muted-foreground">
              Ini contoh nyata format output dari alur Script Faza Studio.
            </p>
          </div>
          <div className="mt-8 border-t pt-8">
            {/* Audio preview */}
            {audioAvailable && (
              <div className="mb-6 flex items-center gap-4 rounded-xl border bg-muted/40 p-4">
                <button
                  type="button"
                  onClick={toggleAudio}
                  aria-label={audioPlaying ? "Pause preview" : "Putar preview"}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-transform hover:scale-105"
                >
                  {audioPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5 translate-x-[1px]" />
                  )}
                </button>
                <div className="flex-1">
                  <p className="text-xs font-medium text-muted-foreground">Dengarkan contohnya</p>
                  <div
                    className="mt-2 h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-border"
                    onClick={(e) => {
                      const el = audioRef.current;
                      if (!el || !audioDuration) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      el.currentTime = ((e.clientX - rect.left) / rect.width) * audioDuration;
                    }}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-150"
                      style={{
                        width: audioDuration ? `${(audioCurrent / audioDuration) * 100}%` : "0%",
                      }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatTime(audioCurrent)} / {formatTime(audioDuration)}
                </span>
              </div>
            )}
            <audio
              ref={audioRef}
              src={CONTOH_AUDIO_SRC}
              preload="metadata"
              onPlay={() => setAudioPlaying(true)}
              onPause={() => setAudioPlaying(false)}
              onEnded={() => {
                setAudioPlaying(false);
                setAudioCurrent(0);
              }}
              onTimeUpdate={(e) => setAudioCurrent(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
              onError={() => setAudioAvailable(false)}
            />
            {/* Script sections — accordion rows */}
            <div className="divide-y border-t border-b">
              {CONTOH_SECTIONS.map((section, i) => (
                <div key={section.label}>
                  <button
                    type="button"
                    onClick={() => setExpandedSection(expandedSection === i ? null : i)}
                    className="flex w-full items-center gap-4 px-1 py-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-sm font-medium">{section.label}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                        expandedSection === i ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {expandedSection === i && (
                    <p className="px-1 pb-4 pl-10 text-sm leading-relaxed text-muted-foreground">
                      {section.text}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <Button variant="outline" size="sm" onClick={handleCobaGratis} disabled={creating}>
                Buat yang serupa
              </Button>
            </div>
          </div>
        </div>
      </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-5xl px-4 py-16 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Investasi kecil, hasil maksimal</h2>
          <p className="mt-3 text-muted-foreground">
            Mulai gratis, naikkan sesuai kebutuhan produksimu.
          </p>
        </div>
        <PricingPlans />
      </section>

      {/* CTA akhir */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-20 lg:px-8">
        <div className="flex flex-col gap-6 rounded-2xl border border-primary/20 bg-primary/5 p-8 sm:flex-row sm:items-center sm:justify-between lg:p-10">
          <div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Siap lanjut jadi audio &amp; video?
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
              Ubah script jadi konten lengkap dalam satu klik.
            </p>
          </div>
          <Button size="lg" className="shrink-0 gap-2 text-white" asChild>
            <Link href="/daftar">
              Lanjutkan ke Studio
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
        </div>
      </section>

      <footer className="border-t bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between lg:px-8">
          <span>© {new Date().getFullYear()} Faza Studio</span>
          <div className="flex gap-4">
            <Link href="/harga" className="hover:text-foreground">Harga</Link>
            <Link href="/masuk" className="hover:text-foreground">Masuk</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}