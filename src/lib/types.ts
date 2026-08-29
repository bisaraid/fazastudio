// ============================================================
// AutoContent Studio — Type Definitions
// ============================================================

export type PipelineMode = "step-by-step" | "full-auto";

export type PipelineStep = "script" | "audio" | "subtitle" | "video" | "export";

export type StepStatus = "pending" | "generating" | "done" | "error";

export type Genre =
  | "horor"
  | "misteri"
  | "psikologi"
  | "romance"
  | "motivasi"
  | "edukasi"
  | "affiliate"
  | "sejarah"
  | "keuangan"
  | "custom";

export type Platform = "tiktok" | "youtube" | "reels" | "podcast";

export type Tone = "formal" | "kasual" | "semangat" | "serius" | "humor" | "misterius";

export type VoiceEmotion = "netral" | "semangat" | "tenang" | "serius" | "ceria" | "sedih";

export type VisualStyle = "stock" | "ai-art" | "template" | "minimal" | "cinematic";

export type VideoFormat = "mp4" | "audio-only" | "srt" | "script-text";

// ============================================================
// Footage
// ============================================================

/**
 * Opsi footage yang ditawarkan sistem (mis. dari Pexels).
 * `sceneId` opsional — untuk masa depan saat footage dipilih per-scene.
 * Untuk MVP, satu footage per project (sceneId tidak diisi).
 */
export interface FootageOption {
  id: string;
  /** URL video (file resolusi terbaik) */
  videoUrl: string;
  /** URL thumbnail/poster untuk preview */
  thumbnail: string;
  /** Durasi video (detik), 0 jika tidak diketahui */
  duration: number;
  /** Query visual yang dipakai untuk mencari footage ini */
  query: string;
  /** Sumber footage (mis. "pexels") */
  source: string;
  /** ID scene jika footage ini dikaitkan ke scene tertentu (opsional) */
  sceneId?: string;
}

// ============================================================
// Project
// ============================================================

export interface Project {
  id: string;
  title: string;
  genre: Genre;
  customGenre?: string;
  topic: string;
  tone: Tone;
  targetDuration: number; // in seconds
  platform: Platform;
  mode: PipelineMode;
  status: "draft" | "processing" | "completed";
  currentStep: PipelineStep;
  steps: Record<PipelineStep, StepStatus>;
  createdAt: string;
  updatedAt: string;
  script?: ScriptResult;
  audio?: AudioResult;
  subtitle?: SubtitleResult;
  video?: VideoResult;
  /** Plan penyimpanan video (dari kolom DB project): free → 24 jam, premium → permanen. */
  videoStoragePlan?: "free" | "premium";
  /** Kapan video free kedaluwarsa (ISO string) — null/undefined untuk premium/permanen. */
  videoExpiresAt?: string | null;
  /**
   * Footage yang dipilih user untuk project ini.
   * Untuk MVP: satu footage per project (sceneId kosong).
   * Struktur siap untuk scene-based (lihat Scene.footage).
   */
  footage?: FootageOption;
}

// ============================================================
// Pipeline Step Results
// ============================================================

export interface Scene {
  id: string;
  order: number;
  heading: string;
  content: string;
  visualPrompt?: string;
  duration: number; // seconds
  /** Mood scene (opsional — diisi oleh script-generator Task 7) */
  sceneMood?: string;
  /** true jika ini scene penutup (terakhir) dari naskah (opsional) */
  isConclusion?: boolean;
  /** Footage yang dipilih user untuk scene ini (opsional — scene-based) */
  footage?: FootageOption;
}

export interface ScriptResult {
  id: string;
  title: string;
  scenes: Scene[];
  fullScript: string;
  estimatedDuration: number;
  wordCount: number;
}

export interface AudioResult {
  id: string;
  url: string; // blob URL or placeholder
  duration: number;
  voiceName: string;
  language: string;
  speed: number;
  emotion: VoiceEmotion;
  fileSize?: number;
  /** Provider TTS yang dipakai: elevenlabs | cartesia | google */
  provider?: "elevenlabs" | "cartesia" | "google";
}

export interface SubtitleEntry {
  id: string;
  startTime: number; // seconds
  endTime: number; // seconds
  text: string;
}

/**
 * Segment subtitle — SOURCE OF TRUTH untuk timing & teks.
 * Dihasilkan oleh transcription (Groq Whisper) dari audio.
 */
export interface SubtitleSegment {
  id: string;
  startTime: number; // seconds
  endTime: number; // seconds
  text: string;
}

/** Style caption/subtitle untuk video composition */
export interface SubtitleStyle {
  fontSize: number;
  color: string;
  position: "bottom" | "top";
  fontFamily?: string;
  /** Warna outline/stroke teks (untuk keterbacaan di footage terang). FFmpeg OutlineColour. */
  strokeColor?: string;
  /** Ketebalan outline (px). Default 2. 0 = tanpa outline. */
  strokeWidth?: number;
  /** Kotak semi-transparan di belakang teks — gaya Netflix. FFmpeg BorderStyle=4. */
  backgroundColor?: string;
  /** Transparansi kotak (0-255, 255 = opaque). NETflix biasanya ~160. */
  backgroundAlpha?: number;
}

export interface SubtitleResult {
  id: string;
  /** Backward compat — bukan sumber timing utama */
  entries: SubtitleEntry[];
  /** SOURCE OF TRUTH — data timing & teks subtitle */
  segments: SubtitleSegment[];
  /** Style caption untuk video composition */
  style: SubtitleStyle;
  srtContent: string;
  vttContent: string;
  language: string;
  /** URL publik subtitle di Supabase Storage (jika ada) */
  url?: string;
}

export interface VideoResult {
  id: string;
  url: string; // blob URL or placeholder
  thumbnailUrl?: string;
  duration: number;
  format: VideoFormat;
  fileSize?: number;
  resolution?: string;
}

// ============================================================
// Wizard Form
// ============================================================

export interface WizardFormData {
  genre: Genre;
  customGenre?: string;
  topic: string;
  tone: Tone;
  targetDuration: number;
  /** Label durasi (mis. "30 detik", "3 menit") — sub-opsi dari platform */
  duration?: string;
  platform: Platform;
  mode: PipelineMode;
  voiceName: string;
  voiceLanguage: string;
  voiceSpeed: number;
  voiceEmotion: VoiceEmotion;
  visualStyle: VisualStyle;
}

// ============================================================
// API Request/Response
// ============================================================

export interface GenerateScriptRequest {
  topic: string;
  genre: Genre;
  customGenre?: string;
  tone: Tone;
  targetDuration: number;
  platform: Platform;
}

export interface GenerateScriptResponse {
  success: boolean;
  data?: ScriptResult;
  error?: string;
}

export interface GenerateAudioRequest {
  script: ScriptResult;
  voiceName: string;
  language: string;
  speed: number;
  emotion: VoiceEmotion;
}

export interface GenerateAudioResponse {
  success: boolean;
  data?: AudioResult;
  error?: string;
}

export interface GenerateSubtitleRequest {
  audio: AudioResult;
  script: ScriptResult;
  language: string;
}

export interface GenerateSubtitleResponse {
  success: boolean;
  data?: SubtitleResult;
  error?: string;
}

export interface GenerateVideoRequest {
  audio: AudioResult;
  subtitle: SubtitleResult;
  scenes: Scene[];
  visualStyle: VisualStyle;
  genre: Genre;
  /** URL footage yang dipilih (derived dari footage state). Opsional — fallback ke recommendation/random. */
  backgroundUrl?: string;
}

export interface GenerateVideoResponse {
  success: boolean;
  data?: VideoResult;
  error?: string;
}

// ============================================================
// Pricing
// ============================================================

export type PlanTier = "free" | "pro" | "team";

export interface Plan {
  id: PlanTier;
  name: string;
  price: number; // harga dalam IDR (Rupiah)
  price_idr: number; // harga dalam IDR, eksplisit
  label_id: string; // label Bahasa Indonesia (Gratis / Pro / Tim)
  creditsPerMonth: number;
  features: string[];
  highlighted?: boolean;
}

export interface UsageLimit {
  used: number;
  total: number;
  resetDate: string;
}