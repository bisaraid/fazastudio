import { Genre, Platform, Tone, VoiceEmotion, VisualStyle, Plan } from "./types";

export const GENRES: { value: Genre; label: string; icon: string }[] = [
  { value: "horor", label: "Horor", icon: "👻" },
  { value: "misteri", label: "Misteri", icon: "🕵️" },
  { value: "psikologi", label: "Psikologi", icon: "🧠" },
  { value: "romance", label: "Romance", icon: "💕" },
  { value: "motivasi", label: "Motivasi", icon: "🔥" },
  { value: "edukasi", label: "Edukasi", icon: "📚" },
  { value: "affiliate", label: "Affiliate", icon: "🛍️" },
  { value: "sejarah", label: "Sejarah", icon: "🏛️" },
  { value: "keuangan", label: "Keuangan", icon: "💰" },
  { value: "custom", label: "Kustom", icon: "✨" },
];

export const PLATFORMS: { value: Platform; label: string; description: string }[] = [
  { value: "tiktok", label: "TikTok", description: "Video vertikal 9:16, durasi 15-60 detik" },
  { value: "youtube", label: "YouTube", description: "Video horizontal 16:9, durasi 1-15 menit" },
  { value: "reels", label: "Instagram Reels", description: "Video vertikal 9:16, durasi 15-90 detik" },
  { value: "podcast", label: "Podcast", description: "Audio saja, durasi 5-60 menit" },
];

export const TONES: { value: Tone; label: string; description: string }[] = [
  { value: "formal", label: "Formal", description: "Bahasa resmi dan profesional" },
  { value: "kasual", label: "Kasual", description: "Santai dan akrab" },
  { value: "semangat", label: "Semangat", description: "Enerjik dan memotivasi" },
  { value: "serius", label: "Serius", description: "Serius dan mendalam" },
  { value: "humor", label: "Humor", description: "Lucu dan menghibur" },
  { value: "misterius", label: "Misterius", description: "Penuh teka-teki dan suspense" },
];

export const VOICES: { name: string; language: string; gender: string }[] = [
  { name: "Budi", language: "id-ID", gender: "Pria" },
  { name: "Sari", language: "id-ID", gender: "Wanita" },
  { name: "Adi", language: "id-ID", gender: "Pria" },
  { name: "Dewi", language: "id-ID", gender: "Wanita" },
  { name: "John", language: "en-US", gender: "Pria" },
  { name: "Emma", language: "en-US", gender: "Wanita" },
];

export const VOICE_EMOTIONS: { value: VoiceEmotion; label: string }[] = [
  { value: "netral", label: "Netral" },
  { value: "semangat", label: "Semangat" },
  { value: "tenang", label: "Tenang" },
  { value: "serius", label: "Serius" },
  { value: "ceria", label: "Ceria" },
  { value: "sedih", label: "Sedih" },
];

export const VISUAL_STYLES: { value: VisualStyle; label: string; description: string }[] = [
  { value: "stock", label: "Stock Footage", description: "Video stok berkualitas tinggi" },
  { value: "ai-art", label: "AI Generated", description: "Visual dibuat oleh AI" },
  { value: "template", label: "Template", description: "Template siap pakai" },
  { value: "minimal", label: "Minimal", description: "Desain minimalis dan bersih" },
  { value: "cinematic", label: "Sinematik", description: "Gaya film sinematik" },
];

// Label TTS dalam bahasa manusia untuk UI — JANGAN tampilkan nama backend
// (cartesia / elevenlabs / google) kepada user.
export const PROVIDER_LABELS: Record<string, string> = {
  cartesia: "Profesional",
  elevenlabs: "Premium",
  google: "Standar (Gratis)",
};

/** Konversi provider backend → label manusia untuk tampilan. */
export function providerLabel(provider?: string | null): string {
  return (provider && PROVIDER_LABELS[provider]) || "Standar (Gratis)";
}

export const DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: "30 detik" },
  { value: 60, label: "1 menit" },
  { value: 180, label: "3 menit" },
  { value: 300, label: "5 menit" },
  { value: 600, label: "10 menit" },
  { value: 900, label: "15 menit" },
  { value: 1800, label: "30 menit" },
  { value: 3600, label: "60 menit" },
];

export const PIPELINE_STEPS = [
  { key: "script" as const, label: "Script", icon: "FileText" },
  { key: "audio" as const, label: "Audio", icon: "Music" },
  { key: "subtitle" as const, label: "Subtitle", icon: "Subtitles" },
  { key: "video" as const, label: "Video", icon: "Video" },
];

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    price_idr: 0,
    label_id: "Gratis",
    creditsPerMonth: 5,
    features: [
      "5 kredit generate per bulan",
      "Kualitas 720p",
      "Watermark Faza Studio",
      "Akses template dasar",
    ],
    highlighted: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 99000,
    price_idr: 99000,
    label_id: "Pro",
    creditsPerMonth: 50,
    features: [
      "50 kredit generate per bulan",
      "Kualitas 1080p",
      "Tanpa watermark",
      "Semua template & gaya visual",
      "Export SRT & VTT",
      "Prioritas dukungan",
    ],
    highlighted: true,
  },
  {
    id: "team",
    name: "Team",
    price: 299000,
    price_idr: 299000,
    label_id: "Tim",
    creditsPerMonth: 200,
    features: [
      "200 kredit generate per bulan",
      "Kualitas 4K",
      "Tanpa watermark",
      "5 akun tim",
      "API access",
      "Dedicated support",
      "Custom branding",
    ],
    highlighted: false,
  },
];