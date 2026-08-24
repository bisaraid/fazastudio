export const CATEGORY_CONFIG = {
  horror: {
    label: "Horror",
    script: {
      tone: "gelap, menegangkan, penuh suspense",
      pacing: "lambat di awal, memuncak di akhir",
      language: "dramatis, deskriptif, membangun ketegangan",
    },
    tts: {
      emotion: "dramatic",
      speed: 0.85,
      stability: 0.75,
    },
    hook: "pertanyaan misterius atau fakta mengejutkan",
  },
  motivasi: {
    label: "Motivasi",
    script: {
      tone: "energetik, positif, membangkitkan semangat",
      pacing: "cepat dan dinamis",
      language: "kuat, inspiring, action-oriented",
    },
    tts: {
      emotion: "energetic",
      speed: 1.1,
      stability: 0.6,
    },
    hook: "pernyataan bold atau statistik mengejutkan",
  },
  psikologi: {
    label: "Psikologi",
    script: {
      tone: "serius, reflektif, membuka wawasan",
      pacing: "sedang, penuh jeda untuk efek",
      language: "intelektual tapi mudah dipahami",
    },
    tts: {
      emotion: "calm",
      speed: 0.95,
      stability: 0.85,
    },
    hook: "pertanyaan yang membuat penonton introspeksi",
  },
  misteri: {
    label: "Misteri & Konspirasi",
    script: {
      tone: "penasaran, dramatis, membangun rasa ingin tahu",
      pacing: "sedang dengan twist di tengah",
      language: "penuh teka-teki, suggestif",
    },
    tts: {
      emotion: "dramatic",
      speed: 0.9,
      stability: 0.7,
    },
    hook: "fakta tersembunyi atau klaim kontroversial",
  },
  edukasi: {
    label: "Edukasi",
    script: {
      tone: "kasual, jelas, mudah dipahami",
      pacing: "terstruktur dan konsisten",
      language: "sederhana, analogis, relatable",
    },
    tts: {
      emotion: "conversational",
      speed: 1.0,
      stability: 0.8,
    },
    hook: "fakta menarik atau pertanyaan sehari-hari",
  },
  romance: {
    label: "Romance",
    script: {
      tone: "hangat, emosional, menyentuh hati",
      pacing: "mengalir, tidak terburu-buru",
      language: "puitis, personal, relatable",
    },
    tts: {
      emotion: "soft",
      speed: 0.9,
      stability: 0.8,
    },
    hook: "skenario relatable atau pertanyaan emosional",
  },
  sejarah: {
    label: "Sejarah",
    script: {
      tone: "informatif, dramatis, menghidupkan masa lalu",
      pacing: "sedang, kronologis",
      language: "naratif, deskriptif, vivid",
    },
    tts: {
      emotion: "dramatic",
      speed: 0.95,
      stability: 0.8,
    },
    hook: "fakta sejarah yang tidak banyak diketahui",
  },
  keuangan: {
    label: "Keuangan",
    script: {
      tone: "praktis, langsung, berbasis data",
      pacing: "cepat, padat, to the point",
      language: "simple, actionable, no jargon",
    },
    tts: {
      emotion: "confident",
      speed: 1.05,
      stability: 0.85,
    },
    hook: "angka mengejutkan atau kesalahan umum",
  },
  affiliate: {
    label: "Affiliate",
    script: {
      tone: "persuasif, benefit-focused, natural",
      pacing: "cepat, problem-solution",
      language: "conversational, tidak hard-sell",
    },
    tts: {
      emotion: "conversational",
      speed: 1.0,
      stability: 0.75,
    },
    hook: "problem yang relatable lalu solusi produk",
  },
} as const;

export type CategoryKey = keyof typeof CATEGORY_CONFIG;

export function getCategoryConfig(slug: string) {
  return CATEGORY_CONFIG[slug as CategoryKey] ?? CATEGORY_CONFIG.edukasi;
}