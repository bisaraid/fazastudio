"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/store/projectStore";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { GENRES } from "@/lib/constants";
import { Genre } from "@/lib/types";
import { fetchTrendingTopics } from "@/lib/trending";

type WizardStep = "genre" | "topic";

export default function BuatPage() {
  const router = useRouter();
  const { wizardForm, updateWizardForm, resetWizardForm } = useProjectStore();
  const [wizardStep, setWizardStep] = useState<WizardStep>("genre");

  const handleBack = () => {
    if (wizardStep === "topic") {
      setWizardStep("genre");
    } else {
      router.push("/");
    }
  };

  const handleNext = () => {
    setWizardStep("topic");
  };

  // Pilih topik → langsung buat project + masuk editor step-by-step.
  // Platform & durasi di-set di step render (editor), bukan di awal.
  const startProject = async () => {
    const formData = {
      ...wizardForm,
      mode: "step-by-step" as const,
      platform: wizardForm.platform || "tiktok",
      targetDuration: wizardForm.targetDuration || 60,
    };
    useProjectStore.getState().updateWizardForm(formData);
    const project = await useProjectStore.getState().createProject(formData);
    router.push(`/project/${project.id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 lg:px-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Buat Konten Baru</h1>
            <p className="text-muted-foreground">Pilih genre dan tentukan topik konten</p>
          </div>
        </div>

        {/* Step Content */}
        {wizardStep === "genre" && (
          <GenreStep
            selected={wizardForm.genre}
            customGenre={wizardForm.customGenre}
            onSelect={(genre, custom) => {
              updateWizardForm({ genre, customGenre: custom });
            }}
            onNext={handleNext}
          />
        )}

        {wizardStep === "topic" && (
          <TopicStep
            form={wizardForm}
            onChange={(data) => updateWizardForm(data)}
            onBack={() => setWizardStep("genre")}
            onStart={startProject}
          />
        )}
      </main>
    </div>
  );
}

// ============================================================
// Step 1: Genre Selection
// ============================================================
function GenreStep({
  selected,
  customGenre,
  onSelect,
  onNext,
}: {
  selected: Genre;
  customGenre?: string;
  onSelect: (genre: Genre, custom?: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Pilih Genre Konten</h2>
        <p className="text-muted-foreground">Genre akan menentukan gaya penulisan dan visual yang digunakan</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {GENRES.map((genre) => (
          <button
            key={genre.value}
            onClick={() => onSelect(genre.value)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              selected === genre.value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-accent"
            }`}
          >
            <span className="text-2xl">{genre.icon}</span>
            <span className="text-sm font-medium">{genre.label}</span>
          </button>
        ))}
      </div>

      {selected === "custom" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Genre Kustom</label>
          <input
            type="text"
            value={customGenre || ""}
            onChange={(e) => onSelect("custom", e.target.value)}
            placeholder="Masukkan genre kustom..."
            className="w-full px-3 py-2 rounded-lg border border-input bg-background"
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={selected === "custom" && !customGenre}>
          Lanjutkan
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
// ============================================================
// Step 2: Topic → langsung mulai (platform/durasi di step render)
// ============================================================
function TopicStep({
  form,
  onChange,
  onBack,
  onStart,
}: {
  form: any;
  onChange: (data: Partial<any>) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const [trendingTopics, setTrendingTopics] = useState<string[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [topicMode, setTopicMode] = useState<"manual" | "trending">("manual");

  useEffect(() => {
    if (!form.genre) return;
    setTrendingLoading(true);
    fetchTrendingTopics(form.genre)
      .then(setTrendingTopics)
      .finally(() => setTrendingLoading(false));
  }, [form.genre]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Tentukan Topik</h2>
        <p className="text-muted-foreground">
          Pilih topik, lalu langsung lanjut ke editor. Platform & durasi diatur saat langkah render.
        </p>
      </div>

      {/* Topic Konten — Toggle Manual / Trending */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Topik Konten</label>

        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setTopicMode("manual")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              topicMode === "manual"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            ✍️ Tulis Manual
          </button>
          <button
            onClick={() => setTopicMode("trending")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              topicMode === "trending"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            🔥 Pilih Trending
          </button>
        </div>

        {topicMode === "manual" ? (
          <input
            type="text"
            placeholder="Contoh: Cara belajar efektif di rumah"
            value={form.topic}
            onChange={(e) => onChange({ topic: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setTrendingLoading(true);
                  fetchTrendingTopics(form.genre)
                    .then(setTrendingTopics)
                    .finally(() => setTrendingLoading(false));
                }}
                className="text-xs text-muted-foreground hover:text-primary"
              >
                ↻ Muat Ulang
              </button>
            </div>

            {trendingLoading ? (
              <p className="text-xs text-muted-foreground py-2">Memuat topik trending...</p>
            ) : trendingTopics.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Belum ada data trending untuk kategori ini</p>
            ) : (
              <div className="flex flex-col gap-2">
                {trendingTopics.slice(0, 5).map((topic) => (
                  <button
                    key={topic}
                    onClick={() => onChange({ topic })}
                    className={`w-full text-left rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                      form.topic === topic
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Kembali
        </Button>
        <Button onClick={onStart} disabled={!form.topic}>
          Buat Konten
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}