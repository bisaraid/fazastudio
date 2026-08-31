/**
 * Data statis onboarding Faza Studio — Layer 1 (tujuan) → Layer 4 (cara cerita).
 *
 * Dipakai oleh:
 * - Halaman /mulai (progressive wizard, SEMUA 4 layer wajib)
 * - Seed/verify kombinasi persona (harus sinkron dengan persona_prompts di DB)
 *
 * Ini hanya LABEL + KEY. Prompt persona disimpan di DB (persona_prompts).
 *
 * KONVENSI KEY (WAJIB SINKRON dengan migrasi 010_seed_personas.sql):
 * - gaya_key   : slug per niche (mis. 'hangat-personal', 'antusias-semangat')
 * - cerita_key : slug per (gaya) — CERITA berbeda per kombinasi niche+gaya.
 */

export type Layer1Mode = "jualan" | "konten";

export interface Layer1Option {
  key: Layer1Mode;
  label: string;
  desc: string;
}

export const LAYER1_OPTIONS: Layer1Option[] = [
  { key: "jualan", label: "Jualan produk di TikTok atau Shopee", desc: "Jualan produk / promo" },
  { key: "konten", label: "Bikin konten buat nambah follower", desc: "Follower & engagement" },
];

export interface NicheOption {
  slug: string;
  label: string;
  /** Key kategori generate/affiliate terkait (eksplisit). */
  categoryId: string;
}

export const NICHES: Record<Layer1Mode, NicheOption[]> = {
  jualan: [
    { slug: "skincare", label: "Skincare & Kecantikan", categoryId: "affiliate" },
    { slug: "fashion", label: "Baju & Fashion", categoryId: "affiliate" },
    { slug: "gadget", label: "Gadget & Elektronik", categoryId: "affiliate" },
    { slug: "makanan", label: "Makanan & Minuman", categoryId: "affiliate" },
    { slug: "suplemen", label: "Suplemen & Kesehatan", categoryId: "affiliate" },
    { slug: "perabot", label: "Perabot & Rumah", categoryId: "affiliate" },
  ],
  konten: [
    { slug: "mistis", label: "Cerita Mistis & Horor", categoryId: "horror" },
    { slug: "motivasi", label: "Motivasi & Kehidupan", categoryId: "motivasi" },
    { slug: "edukasi", label: "Edukasi & Tips Harian", categoryId: "edukasi" },
    { slug: "keuangan", label: "Uang & Investasi", categoryId: "keuangan" },
    { slug: "curhat", label: "Curhat & Relationship", categoryId: "romance" },
    { slug: "sejarah", label: "Sejarah & Fakta Seru", categoryId: "sejarah" },
  ],
};
export interface GayaOption {
  key: string;
  label: string;
}

/** Layer 3 — Gaya ngomong, per niche. Key = gaya_key di DB. */
export const GAYA_BY_NICHE: Record<string, GayaOption[]> = {
  skincare: [
    { key: "hangat-personal", label: "Kayak cerita ke teman dekat" },
    { key: "antusias-semangat", label: "Antusias dan semangat banget" },
    { key: "jujur-apaadanya", label: "Jujur apa adanya" },
  ],
  fashion: [
    { key: "percayadiri-stylish", label: "Percaya diri dan stylish" },
    { key: "gaul-relate", label: "Gaul dan nyambung banget" },
    { key: "heboh-penasaran", label: "Heboh dan bikin penasaran" },
  ],
  gadget: [
    { key: "langsung-inti", label: "Langsung ke intinya" },
    { key: "kagum-excited", label: "Kagum dan excited" },
    { key: "santai-mengalir", label: "Santai dan ngalir aja" },
  ],
  makanan: [
    { key: "ekspresif-lebay", label: "Lebay dan ekspresif" },
    { key: "hangat-ngiler", label: "Hangat dan bikin ngiler" },
    { key: "jujur-santai", label: "Jujur dan santai" },
  ],
  suplemen: [
    { key: "serius-terpercaya", label: "Serius dan bisa dipercaya" },
    { key: "cerita-pengalaman", label: "Cerita pengalaman sendiri" },
    { key: "edukatif-jelas", label: "Jelasin pelan-pelan biar ngerti" },
  ],
  perabot: [
    { key: "hangat-inspiratif", label: "Hangat dan inspiratif" },
    { key: "langsung-point", label: "Langsung to the point" },
    { key: "kalem-aesthetic", label: "Kalem dan aesthetic" },
  ],
  mistis: [
    { key: "pendongeng-pelan", label: "Kayak lagi mendongeng" },
    { key: "dramatis-degdegan", label: "Dramatis dan bikin deg-degan" },
    { key: "datar-creepy", label: "Datar tapi bikin merinding" },
  ],
  motivasi: [
    { key: "bakar-semangat", label: "Bakar semangat" },
    { key: "cerita-hati", label: "Cerita dari hati" },
    { key: "tenang-ngena", label: "Tenang tapi ngena" },
  ],
  edukasi: [
    { key: "simpel-dicerna", label: "Simpel dan gampang dicerna" },
    { key: "serius-mendalam", label: "Serius dan mendalam" },
    { key: "santai-mengalir", label: "Santai dan mengalir" },
  ],
  keuangan: [
    { key: "tegas-terpercaya", label: "Tegas dan terpercaya" },
    { key: "santai-relate", label: "Santai dan relate" },
    { key: "fakta-kaget", label: "Fakta mengejutkan" },
  ],
  curhat: [
    { key: "dalam-menyentuh", label: "Dalam dan menyentuh" },
    { key: "jujur-relate", label: "Jujur dan relate banget" },
    { key: "hangat-nyaman", label: "Hangat dan bikin nyaman" },
  ],
  sejarah: [
    { key: "narator-dramatis", label: "Kayak narator film" },
    { key: "santai-mengalir", label: "Santai dan mengalir" },
    { key: "fakta-kaget", label: "Fakta yang bikin kaget" },
  ],
};
export interface CeritaOption {
  key: string;
  label: string;
}

/**
 * Layer 4 — Cara cerita, per (niche SLG). Struktur dua-level:
 *   CERITA_BY_NICHE_GAYA[nicheSlug][gayaKey] = CeritaOption[]
 * Penting: cerita_key SAMA bisa dipakai kombinasi yang berbeda per niche+gaya,
 * jadi pemetaan harus dua-level untuk menghindari ambiguitas.
 */
export const CERITA_BY_NICHE_GAYA: Record<string, Record<string, CeritaOption[]>> = {
  // ============================ JUALAN ============================
  skincare: {
    "hangat-personal": [
      { key: "cerita-dulu", label: "Cerita pengalaman dulu, baru sebut produk" },
      { key: "langsung-manfaat", label: "Langsung bilang manfaatnya bahasa sehari-hari" },
      { key: "tanya-dulu", label: "Tanya dulu ke yang nonton, baru jawab" },
    ],
    "antusias-semangat": [
      { key: "tunjukin-hasil", label: "Langsung tunjukin hasilnya di awal" },
      { key: "hook-kejutan", label: "Buka dengan sesuatu yang bikin kaget" },
      { key: "semangat-penuh", label: "Penuh semangat dari awal sampai akhir" },
    ],
    "jujur-apaadanya": [
      { key: "plus-minus", label: "Bilang langsung plus minusnya" },
      { key: "ngomong-biasa", label: "Ngomong biasa kayak review teman" },
      { key: "rekomendasi-jujur", label: "Tutup dengan rekomendasi jujur" },
    ],
  },
  fashion: {
    "percayadiri-stylish": [
      { key: "gaya-hidup", label: "Mulai dari soal gaya hidup dulu" },
      { key: "bagian-identitas", label: "Produk jadi bagian dari gaya aku" },
      { key: "elegan-nyambung", label: "Elegan tapi tetap nyambung" },
    ],
    "gaul-relate": [
      { key: "bahasa-muda", label: "Pakai bahasa anak muda" },
      { key: "situasi-relate", label: "Mulai dari situasi yang relate" },
      { key: "ajakan-ringan", label: "Ajakan beli yang tidak terasa jualan" },
    ],
    "heboh-penasaran": [
      { key: "energi-tinggi", label: "Buka dengan energi tinggi" },
      { key: "kata-seru", label: "Penuh kata-kata seru" },
      { key: "closing-kuat", label: "Tutup dengan ajakan yang kuat" },
    ],
  },
  gadget: {
    "langsung-inti": [
      { key: "fakta-spesifikasi", label: "Langsung fakta dan spesifikasi" },
      { key: "sebelum-sesudah", label: "Bandingin sebelum dan sesudah" },
      { key: "manfaat-utama", label: "Manfaat utama tanpa basa-basi" },
    ],
    "kagum-excited": [
      { key: "reaksi-kagum", label: "Buka dengan reaksi kagum yang jujur" },
      { key: "kenapa-beda", label: "Jelasin kenapa ini beda dari yang lain" },
      { key: "ajakan-coba", label: "Tutup dengan ajakan coba sendiri" },
    ],
    "santai-mengalir": [
      { key: "gaya-podcast", label: "Ngobrol santai kayak podcast" },
      { key: "produk-natural", label: "Produk masuk secara natural" },
      { key: "tanpa-tekanan", label: "Tidak ada tekanan sama sekali" },
    ],
  },
  makanan: {
    "ekspresif-lebay": [
      { key: "reaksi-berlebihan", label: "Reaksi berlebihan di awal" },
      { key: "drama-dulu", label: "Drama dulu baru produk masuk" },
      { key: "ekspresi-memorable", label: "Ekspresi yang bikin orang ingat" },
    ],
    "hangat-ngiler": [
      { key: "gambarin-rasa", label: "Gambarin rasanya dulu" },
      { key: "bangun-penasaran", label: "Bangun rasa penasaran sebelum sebut produk" },
      { key: "info-beli-natural", label: "Tutup dengan info beli yang natural" },
    ],
    "jujur-santai": [
      { key: "review-apaadanya", label: "Review apa adanya tanpa lebay" },
      { key: "teman-nyoba", label: "Ngomong kayak teman yang baru nyoba" },
      { key: "rekomendasi-natural", label: "Rekomendasi jujur di akhir" },
    ],
  },
  suplemen: {
    "serius-terpercaya": [
      { key: "buka-data", label: "Buka dengan data atau fakta" },
      { key: "cara-kerja", label: "Jelasin cara kerjanya" },
      { key: "bukti-nyata", label: "Tutup dengan bukti nyata" },
    ],
    "cerita-pengalaman": [
      { key: "masalah-sendiri", label: "Mulai dari masalah yang aku rasain sendiri" },
      { key: "solusi-ditemukan", label: "Produk jadi solusi yang aku temuin" },
      { key: "cerita-perubahan", label: "Ceritain perubahannya" },
    ],
    "edukatif-jelas": [
      { key: "jelasin-masalah", label: "Jelasin masalahnya dulu" },
      { key: "jawaban-logis", label: "Produk jadi jawaban yang masuk akal" },
      { key: "langkah-konkret", label: "Tutup dengan langkah yang bisa langsung dilakuin" },
    ],
  },
  perabot: {
    "hangat-inspiratif": [
      { key: "impian-rumah", label: "Mulai dari impian atau tujuan hidup" },
      { key: "bagian-perjalanan", label: "Produk jadi bagian dari perjalanan itu" },
      { key: "bikin-terbawa", label: "Bikin yang nonton ikut terbawa" },
    ],
    "langsung-point": [
      { key: "masalah-solusi", label: "Langsung masalah dan solusi" },
      { key: "tanpa-basabasi", label: "Tidak ada basa-basi" },
      { key: "ajakan-jelas", label: "Ajakan yang jelas dan mudah diikuti" },
    ],
    "kalem-aesthetic": [
      { key: "buka-tenang", label: "Buka dengan gambaran yang tenang" },
      { key: "produk-halus", label: "Produk masuk secara halus" },
      { key: "kesan-damai", label: "Tutup dengan kesan yang damai" },
    ],
  },
  // ============================ KONTEN ============================
  mistis: {
    "pendongeng-pelan": [
      { key: "bangun-suasana", label: "Bangun suasana dulu pelan-pelan" },
      { key: "masuk-perlahan", label: "Masuk ke cerita secara perlahan" },
      { key: "akhir-menggantung", label: "Akhir yang menggantung atau mengejutkan" },
    ],
    "dramatis-degdegan": [
      { key: "buka-seru", label: "Langsung buka di bagian paling seru" },
      { key: "bangun-ketegangan", label: "Bangun ketegangan terus" },
      { key: "resolusi-memuaskan", label: "Tutup dengan penjelasan yang memuaskan" },
    ],
    "datar-creepy": [
      { key: "tone-datar", label: "Ngomong datar kayak cerita biasa" },
      { key: "fakta-normal", label: "Fakta aneh disampaikan seolah normal" },
      { key: "akhir-tanpa-resolusi", label: "Akhir tanpa penjelasan yang bikin mikir" },
    ],
  },
  motivasi: {
    "bakar-semangat": [
      { key: "kalimat-ngena", label: "Buka dengan kalimat yang langsung ngena" },
      { key: "tantang-mindset", label: "Tantang cara pikir lama" },
      { key: "ajakan-kuat", label: "Tutup dengan ajakan yang kuat" },
    ],
    "cerita-hati": [
      { key: "cerita-gagal", label: "Mulai dari cerita gagal atau titik balik" },
      { key: "perjalanan-relate", label: "Perjalanan yang bikin relate" },
      { key: "harapan-nyata", label: "Akhir yang kasih harapan nyata" },
    ],
    "tenang-ngena": [
      { key: "gaya-mentor", label: "Ngomong kayak mentor ke murid" },
      { key: "insight-dalam", label: "Insight dalam disampaikan pelan" },
      { key: "pertanyaan-refleksi", label: "Tutup dengan pertanyaan buat diri sendiri" },
    ],
  },
  edukasi: {
    "simpel-dicerna": [
      { key: "satu-poin", label: "Satu poin utama per video" },
      { key: "bahasa-simpel", label: "Bahasa sesimpel mungkin" },
      { key: "contoh-nyata", label: "Contoh nyata yang langsung ngerti" },
    ],
    "serius-mendalam": [
      { key: "sudut-beda", label: "Bahas dari sudut yang jarang dibahas" },
      { key: "konteks-luas", label: "Kasih konteks yang lebih luas" },
      { key: "bikin-mikir", label: "Tutup dengan sesuatu yang bikin mikir" },
    ],
    "santai-mengalir": [
      { key: "obrolan-seru", label: "Ngobrol santai tapi tetep seru" },
      { key: "tanpa-tekanan", label: "Tanpa tekanan, santai aja" },
      { key: "tips-praktis", label: "Tips yang bisa langsung dipraktekkan" },
    ],
  },
  keuangan: {
    "tegas-terpercaya": [
      { key: "buka-data", label: "Buka dengan angka atau data" },
      { key: "analisis-singkat", label: "Analisis singkat yang masuk akal" },
      { key: "rekomendasi-konkret", label: "Rekomendasi konkret di akhir" },
    ],
    "santai-relate": [
      { key: "situasi-sehari", label: "Mulai dari situasi keuangan sehari-hari" },
      { key: "tanpa-jargon", label: "Bahasa biasa tanpa istilah ribet" },
      { key: "tips-langsung", label: "Tips yang bisa langsung dipraktekkan" },
    ],
    "fakta-kaget": [
      { key: "fakta-mengejutkan", label: "Buka dengan fakta atau angka mengejutkan" },
      { key: "balik-ekspektasi", label: "Balik ekspektasi yang nonton" },
      { key: "tantangan-aksi", label: "Tutup dengan tantangan atau ajakan" },
    ],
  },
  curhat: {
    "dalam-menyentuh": [
      { key: "perasaan-relate", label: "Mulai dari perasaan yang sangat relate" },
      { key: "cerita-dulu", label: "Cerita dulu baru kesimpulan" },
      { key: "kesan-membekas", label: "Tutup dengan sesuatu yang membekas" },
    ],
    "jujur-relate": [
      { key: "teman-sadar", label: "Ngomong kayak teman yang baru sadar sesuatu" },
      { key: "tidak-menggurui", label: "Tidak menggurui, lebih ke berbagi" },
      { key: "undang-diskusi", label: "Akhir yang mengundang diskusi" },
    ],
    "hangat-nyaman": [
      { key: "tone-pelukan", label: "Tone seperti pelukan" },
      { key: "validasi-dulu", label: "Validasi perasaan yang nonton dulu" },
      { key: "solusi-lembut", label: "Solusi disampaikan dengan lembut" },
    ],
  },
  sejarah: {
    "narator-dramatis": [
      { key: "buka-film", label: "Buka kayak awal film atau dokumenter" },
      { key: "bangun-konflik", label: "Bangun konflik atau misteri" },
      { key: "resolusi-kuat", label: "Tutup dengan resolusi yang kuat" },
    ],
    "santai-mengalir": [
      { key: "ngobrol-sejarah", label: "Sejarah kayak ngobrol sama teman" },
      { key: "fakta-menarik", label: "Fakta menarik yang bikin betah dengerin" },
      { key: "hubung-sekarang", label: "Hubungkan ke kehidupan sekarang" },
    ],
    "fakta-kaget": [
      { key: "fakta-jarang", label: "Buka dengan fakta yang jarang diketahui" },
      { key: "balik-perspektif", label: "Balik perspektif yang dianggap benar" },
      { key: "relevansi-kini", label: "Tutup dengan relevansinya ke kehidupan sekarang" },
    ],
  },
};

/**
 * Ambil opsi cara cerita untuk kombinasi (niche, gaya).
 * Struktur dua-level karena cerita_key bisa berbeda per niche utk gaya yang sama.
 */
export function getCeritaOptions(nicheSlug: string, gayaKey: string): CeritaOption[] {
  return CERITA_BY_NICHE_GAYA[nicheSlug]?.[gayaKey] ?? [];
}

/** Mapping niche -> CategoryId generate. */
export function categoryForNiche(nicheSlug: string): string {
  const all = [...NICHES.jualan, ...NICHES.konten];
  return all.find((n) => n.slug === nicheSlug)?.categoryId ?? "edukasi";
}