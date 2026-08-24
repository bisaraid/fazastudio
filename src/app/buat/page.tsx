"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/store/projectStore";
import { usePipeline } from "@/hooks/usePipeline";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Zap,
  StepForward,
  Play,
  Settings2,
  Film,
  Music,
  Languages,
  Type,
  Crown,
} from "lucide-react";
import {
  GENRES,
  PLATFORMS,
  DURATION_OPTIONS,
  VOICES,
  VISUAL_STYLES,
} from "@/lib/constants";
import { WizardFormData, Genre, Platform, VisualStyle } from "@/lib/types";
import { fetchTrendingTopics } from "@/lib/trending";

type WizardStep = "genre" | "details" | "voice" | "visual" | "review";

export default function BuatPage() {
  const router = useRouter();
  const { wizardForm, updateWizardForm, resetWizardForm } = useProjectStore();
  const { progress, generateAll } = usePipeline();
  const [wizardStep, setWizardStep] = useState<WizardStep>("genre");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleBack = () => {
    const steps: WizardStep[] = ["genre", "details", "voice", "visual", "review"];
    const currentIndex = steps.indexOf(wizardStep);
    if (currentIndex > 0) {
      setWizardStep(steps[currentIndex - 1]);
    } else {
      router.push("/");
    }
  };

  const handleNext = () => {
    const steps: WizardStep[] = ["genre", "details", "voice", "visual", "review"];
    const currentIndex = steps.indexOf(wizardStep);
    if (currentIndex < steps.length - 1) {
      setWizardStep(steps[currentIndex + 1]);
    }
  };

  const handleGenerateAll = async () => {
    setIsGenerating(true);
    // Set mode to full-auto
    useProjectStore.getState().updateWizardForm({ mode: "full-auto" });
    try {
      await generateAll({ ...wizardForm, mode: "full-auto" });
      // Find the newly created project and navigate to editor for review
      const projects = useProjectStore.getState().projects;
      const newestProject = projects[0];
      if (newestProject) {
        router.push(`/project/${newestProject.id}`);
      }
    } catch (error) {
      console.error("Generate failed:", error);
    }
    setIsGenerating(false);
  };

  const handleStepByStep = async () => {
    // Set mode to step-by-step
    const formData = { ...wizardForm, mode: "step-by-step" as const };
    useProjectStore.getState().updateWizardForm({ mode: "step-by-step" });
    const project = await useProjectStore.getState().createProject(formData);
    // Navigate to editor - script will auto-generate on entry
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
            <p className="text-muted-foreground">Isi detail konten yang ingin dibuat</p>
          </div>
        </div>

        {/* Wizard Steps */}
        <div className="flex items-center gap-2 mb-8">
          {(["genre", "details", "voice", "visual", "review"] as WizardStep[]).map((step, i) => {
            const labels: Record<WizardStep, string> = {
              genre: "Genre",
              details: "Detail",
              voice: "Suara",
              visual: "Visual",
              review: "Review",
            };
            const currentIndex = (["genre", "details", "voice", "visual", "review"] as WizardStep[]).indexOf(wizardStep);
            const stepIndex = i;
            const isActive = stepIndex === currentIndex;
            const isCompleted = stepIndex < currentIndex;

            return (
              <div key={step} className="flex items-center gap-2 flex-1">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isCompleted
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? "✓" : i + 1}
                </div>
                <span className={`text-sm hidden sm:inline ${isActive ? "font-medium" : "text-muted-foreground"}`}>
                  {labels[step]}
                </span>
                {i < 4 && <div className="flex-1 h-px bg-border" />}
              </div>
            );
          })}
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

        {wizardStep === "details" && (
          <DetailsStep
            form={wizardForm}
            onChange={(data) => updateWizardForm(data)}
            onNext={handleNext}
            onBack={() => setWizardStep("genre")}
            onStepByStep={handleStepByStep}
            onGenerateAll={() => {
              // Lanjut ke step voice untuk setting lengkap sebelum generate all
              handleNext();
            }}
          />
        )}

        {wizardStep === "voice" && (
          <VoiceStep
            form={wizardForm}
            onChange={(data) => updateWizardForm(data)}
            onNext={handleNext}
            onBack={() => setWizardStep("details")}
          />
        )}

        {wizardStep === "visual" && (
          <VisualStep
            form={wizardForm}
            onChange={(data) => updateWizardForm(data)}
            onNext={handleNext}
            onBack={() => setWizardStep("voice")}
          />
        )}

        {wizardStep === "review" && (
          <ReviewStep
            form={wizardForm}
            onBack={() => setWizardStep("visual")}
            onStepByStep={handleStepByStep}
            onGenerateAll={handleGenerateAll}
            isGenerating={isGenerating}
            progress={progress}
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
// Step 2: Details
// ============================================================

const PLATFORM_CONFIG = {
  tiktok: {
    label: "TikTok",
    description: "Video vertikal 9:16",
    durations: ["15 detik", "30 detik", "60 detik"],
    defaultDuration: "30 detik",
  },
  youtube: {
    label: "YouTube",
    description: "Video horizontal 16:9",
    durations: ["1 menit", "3 menit", "5 menit", "10 menit"],
    defaultDuration: "3 menit",
  },
  reels: {
    label: "Instagram Reels",
    description: "Video vertikal 9:16",
    durations: ["15 detik", "30 detik", "60 detik", "90 detik"],
    defaultDuration: "30 detik",
  },
  podcast: {
    label: "Podcast",
    description: "Audio saja",
    durations: ["5 menit", "10 menit", "30 menit"],
    defaultDuration: "10 menit",
  },
} as const;

/** Konversi label durasi (mis. "30 detik", "3 menit") ke detik */
function durationLabelToSeconds(label: string): number {
  const match = label.match(/(\d+)\s*(detik|menit)/);
  if (!match) return 60;
  const value = parseInt(match[1], 10);
  return match[2] === "menit" ? value * 60 : value;
}

function DetailsStep({
  form,
  onChange,
  onNext,
  onBack,
  onStepByStep,
  onGenerateAll,
}: {
  form: WizardFormData;
  onChange: (data: Partial<WizardFormData>) => void;
  onNext: () => void;
  onBack: () => void;
  onStepByStep: () => Promise<void>;
  onGenerateAll: () => void;
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
        <h2 className="text-xl font-semibold mb-2">Detail Konten</h2>
        <p className="text-muted-foreground">Tentukan topik, durasi, platform, dan mode pembuatan</p>
      </div>

      {/* Topic Konten — Toggle Manual / Trending */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Topik Konten</label>

        {/* Toggle Mode */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setTopicMode("manual")}
            className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${topicMode === "manual"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground"}`}
          >
            ✍️ Tulis Manual
          </button>
          <button
            onClick={() => setTopicMode("trending")}
            className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${topicMode === "trending"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground"}`}
          >
            🔥 Pilih Trending
          </button>
        </div>

        {/* Konten sesuai mode */}
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
            {/* Tombol Muat Ulang */}
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setTrendingLoading(true);
                  fetchTrendingTopics(form.genre)
                    .then(setTrendingTopics)
                    .finally(() => setTrendingLoading(false));
                }}
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                ↻ Muat Ulang
              </button>
            </div>

            {/* Daftar Trending */}
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
                    className={`w-full text-left rounded-lg border px-4 py-2.5 text-sm transition-colors
                      ${form.topic === topic
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border hover:border-primary/40 hover:bg-primary/5"}`}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            )}

            {/* Field Edit — muncul hanya setelah ada topik terpilih */}
            {form.topic && (
              <div className="space-y-1 pt-1">
                <label className="text-xs text-muted-foreground">
                  ✏️ Edit judul sebelum lanjut (opsional)
                </label>
                <input
                  type="text"
                  value={form.topic}
                  onChange={(e) => onChange({ topic: e.target.value })}
                  className="w-full rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Platform + Durasi (durasi = sub-opsi platform) */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Platform Tujuan</label>

        {/* Pilih Platform */}
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => {
                const platform = key as Platform;
                const dur = config.defaultDuration;
                onChange({
                  platform,
                  duration: dur,
                  targetDuration: durationLabelToSeconds(dur),
                });
              }}
              className={`rounded-lg border p-3 text-left transition-colors
                ${form.platform === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/40"}`}
            >
              <div className="text-sm font-medium">{config.label}</div>
              <div className="text-xs text-muted-foreground">{config.description}</div>
            </button>
          ))}
        </div>

        {/* Sub-opsi Durasi — muncul hanya jika platform dipilih */}
        {form.platform && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Durasi Konten</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_CONFIG[form.platform as keyof typeof PLATFORM_CONFIG]
                .durations.map((dur) => (
                  <button
                    key={dur}
                    onClick={() => {
                      onChange({
                        duration: dur,
                        targetDuration: durationLabelToSeconds(dur),
                      });
                    }}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors
                      ${form.duration === dur
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary/40"}`}
                  >
                    {dur}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Pilihan Mode — muncul setelah topik + platform + durasi dipilih */}
      {form.topic && form.platform && (
        <div className="space-y-3 border-t pt-4">
          <div>
            <h3 className="text-sm font-medium">Pilih Mode Pembuatan</h3>
            <p className="text-xs text-muted-foreground">
              Pilih cara membuat konten: step-by-step (per tahap) atau otomatis penuh.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Manual Step */}
            <button
              onClick={onStepByStep}
              className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-accent transition-all text-left"
            >
              <div className="flex items-center gap-2">
                <StepForward className="h-5 w-5 text-primary" />
                <span className="font-medium">Manual Step</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Generate script → edit → approve → lanjut audio → pilih footage → render video.
                Subtitle otomatis diproses setelah audio. Kontrol penuh di setiap tahap.
              </p>
            </button>

            {/* Generate All */}
            <button
              onClick={onGenerateAll}
              className="flex flex-col items-start gap-2 p-4 rounded-xl border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-all text-left"
            >
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <span className="font-medium">Generate All</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Setting lengkap (voice, visual) → 1 klik → script → audio → subtitle → video → selesai.
                Paling cepat.
              </p>
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Kembali
        </Button>
        <Button onClick={onNext} disabled={!form.topic}>
          Lanjutkan
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Step 3: Voice
// ============================================================
function VoiceStep({
  form,
  onChange,
  onNext,
  onBack,
}: {
  form: WizardFormData;
  onChange: (data: Partial<WizardFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Pilih Suara</h2>
        <p className="text-muted-foreground">Pilih voice untuk text-to-speech</p>
      </div>

      {/* Voice */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Voice</label>
        <div className="grid grid-cols-2 gap-2">
          {VOICES.map((voice) => (
            <button
              key={voice.name}
              onClick={() => onChange({ voiceName: voice.name, voiceLanguage: voice.language })}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                form.voiceName === voice.name
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <Music className="h-5 w-5 text-muted-foreground" />
              <div className="text-left">
                <div className="font-medium text-sm">{voice.name}</div>
                <div className="text-xs text-muted-foreground">
                  {voice.gender} • {voice.language}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Speed */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Kecepatan: {form.voiceSpeed}x</label>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.25"
          value={form.voiceSpeed}
          onChange={(e) => onChange({ voiceSpeed: parseFloat(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Lambat (0.5x)</span>
          <span>Normal (1.0x)</span>
          <span>Cepat (2.0x)</span>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Kembali
        </Button>
        <Button onClick={onNext}>
          Lanjutkan
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Step 4: Visual
// ============================================================
function VisualStep({
  form,
  onChange,
  onNext,
  onBack,
}: {
  form: WizardFormData;
  onChange: (data: Partial<WizardFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Gaya Visual</h2>
        <p className="text-muted-foreground">Pilih gaya visual yang sesuai dengan kontenmu</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {VISUAL_STYLES.map((style) => (
          <button
            key={style.value}
            onClick={() => onChange({ visualStyle: style.value })}
            className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
              form.visualStyle === style.value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <Film className="h-6 w-6 text-primary" />
            <span className="font-medium">{style.label}</span>
            <span className="text-xs text-muted-foreground">{style.description}</span>
          </button>
        ))}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Kembali
        </Button>
        <Button onClick={onNext}>
          Review
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Step 5: Review & Generate
// ============================================================
function ReviewStep({
  form,
  onBack,
  onStepByStep,
  onGenerateAll,
  isGenerating,
  progress,
}: {
  form: WizardFormData;
  onBack: () => void;
  onStepByStep: () => void;
  onGenerateAll: () => void;
  isGenerating: boolean;
  progress: { progress: number; statusMessage: string; isRunning: boolean };
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Review & Generate</h2>
        <p className="text-muted-foreground">Periksa kembali detail konten sebelum memulai</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-muted-foreground">Genre</span>
              <p className="font-medium">
                {GENRES.find((g) => g.value === form.genre)?.label || form.customGenre}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Platform</span>
              <p className="font-medium">{PLATFORMS.find((p) => p.value === form.platform)?.label}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Topik</span>
              <p className="font-medium">{form.topic}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Durasi</span>
              <p className="font-medium">
                {DURATION_OPTIONS.find((d) => d.value === form.targetDuration)?.label}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Mode</span>
              <p className="font-medium">{form.mode === "step-by-step" ? "Step by Step" : "Full Auto"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Voice</span>
              <p className="font-medium">{form.voiceName}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Visual</span>
              <p className="font-medium">{VISUAL_STYLES.find((v) => v.value === form.visualStyle)?.label}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress bar for full auto */}
      {isGenerating && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{progress.statusMessage}</span>
            <span className="font-medium">{Math.round(progress.progress)}%</span>
          </div>
          <Progress value={progress.progress} className="h-2" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <Button variant="outline" onClick={onBack} disabled={isGenerating}>
          Kembali
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={onStepByStep}
            disabled={isGenerating}
            className="gap-2"
          >
            <StepForward className="h-5 w-5" />
            Step by Step
          </Button>
          <Button
            size="lg"
            onClick={onGenerateAll}
            disabled={isGenerating}
            className="gap-2"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent" />
                Memproses...
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                Generate All
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}