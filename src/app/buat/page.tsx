"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/store/projectStore";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { GENRES, PLATFORMS } from "@/lib/constants";
import { Genre, Platform } from "@/lib/types";
import { fetchTopicSuggestions, TopicSource } from "@/lib/trending";

interface DurationOption {
  label: string;
  seconds: number;
}

const DURATION_BY_PLATFORM: Record<Platform, DurationOption[]> = {
  tiktok: [
    { label: "15 det", seconds: 15 },
    { label: "30 det", seconds: 30 },
    { label: "60 det", seconds: 60 },
    { label: "90 det", seconds: 90 },
  ],
  reels: [
    { label: "15 det", seconds: 15 },
    { label: "30 det", seconds: 30 },
    { label: "60 det", seconds: 60 },
    { label: "90 det", seconds: 90 },
  ],
  youtube: [
    { label: "3 mnt", seconds: 180 },
    { label: "5 mnt", seconds: 300 },
    { label: "10 mnt", seconds: 600 },
  ],
  podcast: [
    { label: "5 mnt", seconds: 300 },
    { label: "10 mnt", seconds: 600 },
    { label: "20 mnt", seconds: 1200 },
  ],
};

export default function BuatPage() {
  const router = useRouter();
  const { wizardForm, updateWizardForm } = useProjectStore();

  const [platform, setPlatform] = useState<Platform>(
    wizardForm.platform || "tiktok"
  );
  const [targetDuration, setTargetDuration] = useState<number>(
    wizardForm.targetDuration ||
      DURATION_BY_PLATFORM[wizardForm.platform || "tiktok"][0].seconds
  );
  const [genre, setGenre] = useState<Genre | null>(null);
  const [customGenre, setCustomGenre] = useState<string>("");
  const [animateDuration, setAnimateDuration] = useState(false);
  // Progressive disclosure — bagian berikutnya muncul setelah pilihan sebelumnya.
  const [durationChosen, setDurationChosen] = useState(false);
  const [genreChosen, setGenreChosen] = useState(false);

  const [topic, setTopic] = useState<string>(wizardForm.topic || "");
  const [topicMode, setTopicMode] = useState<"manual" | "trending">("manual");
  const [trendingTopics, setTrendingTopics] = useState<string[]>([]);
  const [topicSource, setTopicSource] = useState<TopicSource>("empty");
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isCustomGenre = genre === "custom";

  const loadSuggestions = useCallback(async (genreValue: string) => {
    setTrendingLoading(true);
    const { ideas, source } = await fetchTopicSuggestions(genreValue);
    setTrendingTopics(ideas);
    setTopicSource(source);
    setTrendingLoading(false);
  }, []);

  // Muat trending saat genre (bukan kustom) dipilih.
  useEffect(() => {
    if (!genre || genre === "custom") return;
    loadSuggestions(genre);
  }, [genre, loadSuggestions]);

  const handleSelectPlatform = (p: Platform) => {
    if (p !== platform) setAnimateDuration(true);
    setPlatform(p);
    const first = DURATION_BY_PLATFORM[p][0].seconds;
    setTargetDuration(first);
    // Ubah platform → reset downstream (durasi belum dipilih ulang, genre/topik disembunyikan).
    setDurationChosen(false);
    setGenreChosen(false);
    updateWizardForm({ platform: p, targetDuration: first });
  };

  const handleSelectGenre = (g: Genre) => {
    setGenre(g);
    setGenreChosen(true);
    updateWizardForm({
      genre: g,
      customGenre: g === "custom" ? customGenre : undefined,
    });
  };

  const handleCustomChange = (value: string) => {
    setCustomGenre(value);
    updateWizardForm({ genre: "custom", customGenre: value });
  };

  const genreReady =
    genre !== null && (genre !== "custom" || customGenre.trim().length > 0);
  const canSubmit =
    topic.trim().length > 0 &&
    genreReady &&
    durationChosen &&
    genreChosen;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const formData = {
      ...wizardForm,
      genre: genre as Genre,
      customGenre: isCustomGenre ? customGenre : undefined,
      topic,
      platform,
      targetDuration,
      mode: "step-by-step" as const,
    };
    updateWizardForm(formData);
    setSubmitting(true);
    try {
      const project = await useProjectStore.getState().createProject(formData);
      router.push(`/project/${project.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-6 lg:px-8 pb-28">
        {/* Header */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="Kembali"
            className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold tracking-tight">Buat Konten Baru</h1>
          <p className="text-muted-foreground">
            Pilih platform, durasi, genre, dan topik kontenmu
          </p>
        </div>

        {/* Platform */}
        <section className="space-y-2 mb-6">
          <label className="text-sm font-medium">Platform</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const active = platform === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handleSelectPlatform(p.value)}
                  className={`h-10 rounded-full px-4 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </section>
{/* Durasi */}
        <section className="space-y-2 mb-6">
          <label className="text-sm font-medium">Durasi</label>
          <div
            className={
              animateDuration
                ? "flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out"
                : "flex flex-wrap gap-2"
            }
          >
            {DURATION_BY_PLATFORM[platform].map((d) => {
              const active = targetDuration === d.seconds;
              return (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => {
                    setTargetDuration(d.seconds);
                    setDurationChosen(true);
                    updateWizardForm({ targetDuration: d.seconds });
                  }}
                  className={`h-10 rounded-full px-4 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Genre (muncul setelah durasi dipilih) */}
        {durationChosen && (
        <section className="space-y-2 mb-6">
          <label className="text-sm font-medium">Genre</label>
          <div className="grid grid-cols-3 gap-2">
            {GENRES.map((g) => {
              const active = genre === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => handleSelectGenre(g.value)}
                  className={`h-9 rounded-full px-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground"
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
          {isCustomGenre && (
            <input
              type="text"
              value={customGenre}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder="Masukkan genre kustom..."
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </section>
        )}

        {/* Topik (muncul setelah genre dipilih) */}
        {genreChosen && (
        <section className="space-y-3 mb-6">
          <label className="text-sm font-medium">Topik</label>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setTopicMode("manual")}
              className={`h-11 flex-1 text-sm font-medium transition-colors ${
                topicMode === "manual"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              ✍️ Tulis Manual
            </button>
            <button
              type="button"
              onClick={() => setTopicMode("trending")}
              className={`h-11 flex-1 text-sm font-medium transition-colors ${
                topicMode === "trending"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              🔥 Pilih Trending
            </button>
          </div>

          {topicMode === "manual" ? (
            <textarea
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                updateWizardForm({ topic: e.target.value });
              }}
              placeholder="Contoh: cara belajar efektif untuk pelajar SMA"
              rows={4}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          ) : (
            <TopicSuggestions
              genre={genre}
              isCustomGenre={isCustomGenre}
              topics={trendingTopics}
              source={topicSource}
              loading={trendingLoading}
              selected={topic}
              onSelect={(t) => {
                setTopic(t);
                updateWizardForm({ topic: t });
              }}
              onReload={() => genre && loadSuggestions(genre)}
            />
          )}
        </section>
        )}
      </main>

      {/* Sticky action */}
      <div className="sticky bottom-0 z-40 border-t bg-background/95 py-4 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 lg:px-8">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full h-14 rounded-xl gap-2 text-base"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Membuat konten...
              </>
            ) : (
              <>Buat Konten →</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TopicSuggestions({
  genre,
  isCustomGenre,
  topics,
  source,
  loading,
  selected,
  onSelect,
  onReload,
}: {
  genre: Genre | null;
  isCustomGenre: boolean;
  topics: string[];
  source: TopicSource;
  loading: boolean;
  selected: string;
  onSelect: (t: string) => void;
  onReload: () => void;
}) {
  if (isCustomGenre) {
    return (
      <p className="text-xs text-muted-foreground">
        Genre kustom belum punya saran tren. Gunakan "Tulis Manual" untuk topikmu sendiri.
      </p>
    );
  }
  if (!genre) {
    return (
      <p className="text-xs text-muted-foreground">
        Pilih genre terlebih dahulu untuk melihat saran topik.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onReload}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Muat Ulang
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground py-2">Memuat topik trending...</p>
      ) : topics.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          Belum ada topik yang bisa disarankan untuk kategori ini. Coba "Tulis Manual".
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            {source === "ai"
              ? "🪄 Saran ini dihasilkan AI (bukan data trending), gunakan sebagai inspirasi."
              : "🔥 Berdasarkan tren terbaru."}
          </p>
          <div className="flex flex-col gap-2">
            {topics.slice(0, 5).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onSelect(t)}
                className={`min-h-11 w-full text-left rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  selected === t
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}