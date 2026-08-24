import {
  Scene,
  ScriptResult,
  AudioResult,
  SubtitleResult,
  VideoResult,
  Project,
} from "./types";
import { generateId } from "./utils";

// ============================================================
// Mock Data Generators
// ============================================================

export function generateMockScript(topic: string, genre: string, duration: number): ScriptResult {
  const wordCount = Math.floor((duration / 60) * 150); // ~150 words per minute
  const sceneCount = Math.max(3, Math.floor(duration / 30));

  const scenes: Scene[] = Array.from({ length: sceneCount }, (_, i) => ({
    id: generateId(),
    order: i + 1,
    heading: `Bagian ${i + 1}: ${getSceneHeading(topic, genre, i)}`,
    content: getSceneContent(topic, genre, i, sceneCount),
    visualPrompt: getVisualPrompt(genre, i),
    duration: Math.floor(duration / sceneCount),
  }));

  const fullScript = scenes.map((s) => `${s.heading}\n${s.content}`).join("\n\n");

  return {
    id: generateId(),
    title: `${topic} — Otomatis oleh Viraloop`,
    scenes,
    fullScript,
    estimatedDuration: duration,
    wordCount,
  };
}

function getSceneHeading(topic: string, genre: string, index: number): string {
  const headings: Record<string, string[]> = {
    edukasi: [
      "Pendahuluan & Konsep Dasar",
      "Mengapa Ini Penting?",
      "Cara Kerjanya",
      "Contoh Penerapan",
      "Kesimpulan & Tips",
    ],
    horor: [
      "Malam yang Sunyi",
      "Suara Aneh Mulai Terdengar",
      "Sesuatu Bergerak di Kegelapan",
      "Teror Semakin Nyata",
      "Akhir yang Mencekam",
    ],
    motivasi: [
      "Kenali Potensi Dirimu",
      "Rintangan Adalah Batu Loncatan",
      "Kisah Sukses yang Menginspirasi",
      "Langkah Kecil Menuju Perubahan",
      "Kamu Bisa!",
    ],
    misteri: [
      "Kasus yang Belum Terpecahkan",
      "Fakta di Lapangan",
      "Teori-teori yang Beredar",
      "Investigasi Lebih Dalam",
      "Tanda Tanya yang Tersisa",
    ],
    romance: [
      "Pertemuan Awal",
      "Perasaan Mulai Tumbuh",
      "Konflik Emosional",
      "Momen Menegangkan",
      "Resolusi yang Mengharukan",
    ],
    psikologi: [
      "Fenomena yang Relate",
      "Data & Riset",
      "Mekanisme Psikologis",
      "Implikasi Praktis",
      "Takeaway",
    ],
    affiliate: [
      "Masalah yang Dihadapi",
      "Perkenalan Produk",
      "Fitur Kunci",
      "Bukti & Hasil",
      "Call to Action",
    ],
    sejarah: [
      "Fakta Tersembunyi",
      "Konteks Sejarah",
      "Kronologi Peristiwa",
      "Dampak ke Masa Kini",
      "Refleksi",
    ],
    keuangan: [
      "Masalah Keuangan",
      "Mindset yang Keliru",
      "Solusi Praktis",
      "Contoh Nyata",
      "Disclaimer & Kesimpulan",
    ],
  };

  const genreHeadings = headings[genre] || [
    "Pembukaan",
    "Isi Bagian 1",
    "Isi Bagian 2",
    "Klimaks",
    "Penutup",
  ];

  return genreHeadings[index % genreHeadings.length] || `Bagian ${index + 1}`;
}

function getSceneContent(topic: string, genre: string, index: number, total: number): string {
  const templates = [
    `Halo, kali ini kita akan membahas tentang ${topic}. ${genre === "edukasi" ? "Konsep ini sangat penting untuk dipahami karena berdampak langsung pada kehidupan sehari-hari." : "Kisah ini akan membuatmu merinding sekaligus penasaran."}`,
    `Tahukah kamu bahwa ${topic} memiliki banyak sisi menarik? Mari kita telusuri lebih dalam. ${genre === "motivasi" ? "Setiap orang memiliki potensi luar biasa yang sering tidak disadari." : "Detail-detail kecil mulai terungkap satu per satu."}`,
    `Yang membuat ${topic} begitu istimewa adalah... ${genre === "romance" ? "emosi yang terasa begitu dekat dengan kehidupan kita!" : "fakta-fakta yang tersembunyi di baliknya."}`,
    `Sekarang kita sampai di bagian paling seru. ${topic} mengajarkan kita bahwa ${genre === "horor" ? "tidak semua hal bisa dijelaskan dengan logika." : "setiap tantangan pasti ada jalan keluarnya."}`,
    `Kesimpulannya, ${topic} adalah topik yang sangat relevan. ${genre === "motivasi" ? "Jangan pernah menyerah! Teruslah belajar dan berkembang." : "Semoga informasi ini bermanfaat untukmu. Jangan lupa subscribe!"}`,
  ];

  return templates[index % templates.length];
}

function getVisualPrompt(genre: string, index: number): string {
  const prompts: Record<string, string[]> = {
    edukasi: [
      "Animasi whiteboard dengan ikon-ikon edukasi",
      "Tampilan slide presentasi profesional",
      "Infografis bergerak dengan data statistik",
      "Demonstrasi praktik langsung",
      "Rekap visual dengan mind map",
    ],
    horor: [
      "Rumah tua gelap di malam hari dengan kabut tipis",
      "Koridor sempit dengan pencahayaan remang-remang",
      "Bayangan misterius di balik tirai",
      "Cermin retak dengan refleksi aneh",
      "Halaman kuburan di bawah sinar bulan purnama",
    ],
    motivasi: [
      "Matahari terbit di atas gunung",
      "Orang sedang berlari di treadmill",
      "Tangan saling membantu",
      "Piala dan penghargaan berkilau",
      "Siluet orang berdiri di tebing",
    ],
  };

  const genrePrompts = prompts[genre] || [
    "Visual sinematik dengan komposisi menarik",
    "Close-up detail dengan depth of field",
    "Wide shot pemandangan luas",
    "Slow motion dengan lighting dramatis",
    "Montage cepat dengan transisi dinamis",
  ];

  return genrePrompts[index % genrePrompts.length];
}

export function generateMockAudio(script: ScriptResult, voiceName: string): AudioResult {
  return {
    id: generateId(),
    url: "#", // placeholder - akan diisi blob URL real
    duration: script.estimatedDuration,
    voiceName,
    language: "id-ID",
    speed: 1.0,
    emotion: "netral",
    fileSize: Math.floor(script.estimatedDuration * 16000), // estimasi ~16KB per detik
  };
}

export function generateMockSubtitle(audio: AudioResult, script: ScriptResult): SubtitleResult {
  const entries = script.scenes.flatMap((scene) => {
    const lines = splitIntoLines(scene.content, 50);
    const durationPerLine = scene.duration / lines.length;
    let currentTime = script.scenes
      .slice(0, scene.order - 1)
      .reduce((acc, s) => acc + s.duration, 0);

    return lines.map((line) => {
      const entry = {
        id: generateId(),
        startTime: currentTime,
        endTime: currentTime + durationPerLine,
        text: line,
      };
      currentTime += durationPerLine;
      return entry;
    });
  });

  const srtContent = entries
    .map(
      (e, i) =>
        `${i + 1}\n${formatSrtTime(e.startTime)} --> ${formatSrtTime(e.endTime)}\n${e.text}`
    )
    .join("\n\n");

  const vttContent = `WEBVTT\n\n${entries
    .map(
      (e, i) =>
        `${formatSrtTime(e.startTime)} --> ${formatSrtTime(e.endTime)}\n${e.text}`
    )
    .join("\n\n")}`;

  // Segments = SOURCE OF TRUTH (untuk mock, dipetakan dari entries)
  const segments = entries.map((e) => ({
    id: e.id,
    startTime: e.startTime,
    endTime: e.endTime,
    text: e.text,
  }));

  return {
    id: generateId(),
    entries,
    segments,
    style: { fontSize: 24, color: "#FFFFFF", position: "bottom" },
    srtContent,
    vttContent,
    language: "id-ID",
  };
}

function splitIntoLines(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxChars) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

export function generateMockVideo(audio: AudioResult, _subtitle: SubtitleResult): VideoResult {
  return {
    id: generateId(),
    url: "#", // placeholder
    thumbnailUrl: undefined,
    duration: audio.duration,
    format: "mp4",
    fileSize: Math.floor(audio.duration * 50000), // estimasi ~50KB per detik
    resolution: "1920x1080",
  };
}

// ============================================================
// Initial Mock Projects
// ============================================================

export const MOCK_PROJECTS: Project[] = [
  {
    id: "proj-1",
    title: "Cara Belajar Efektif di Rumah",
    genre: "edukasi",
    topic: "Belajar efektif di rumah",
    tone: "semangat",
    targetDuration: 60,
    platform: "tiktok",
    mode: "step-by-step",
    status: "completed",
    currentStep: "export",
    steps: { script: "done", audio: "done", subtitle: "done", video: "done", export: "pending" },
    createdAt: "2026-07-28T10:00:00Z",
    updatedAt: "2026-07-28T12:00:00Z",
  },
  {
    id: "proj-2",
    title: "Kisah Horor Malam Jumat",
    genre: "horor",
    topic: "Pengalaman horor malam Jumat",
    tone: "misterius",
    targetDuration: 180,
    platform: "youtube",
    mode: "full-auto",
    status: "processing",
    currentStep: "audio",
    steps: { script: "done", audio: "generating", subtitle: "pending", video: "pending", export: "pending" },
    createdAt: "2026-07-30T08:00:00Z",
    updatedAt: "2026-07-30T08:30:00Z",
  },
  {
    id: "proj-3",
    title: "Tips Produktivitas Pagi Hari",
    genre: "motivasi",
    topic: "Produktivitas di pagi hari",
    tone: "semangat",
    targetDuration: 30,
    platform: "reels",
    mode: "step-by-step",
    status: "draft",
    currentStep: "script",
    steps: { script: "pending", audio: "pending", subtitle: "pending", video: "pending", export: "pending" },
    createdAt: "2026-07-31T06:00:00Z",
    updatedAt: "2026-07-31T06:00:00Z",
  },
];