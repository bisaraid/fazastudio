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
    { slug: "otomotif", label: "Otomotif", categoryId: "autos" },
    { slug: "kesehatan", label: "Kesehatan", categoryId: "health" },
    { slug: "rumah", label: "Rumah & Dekor", categoryId: "home" },
    { slug: "bayi", label: "Bayi & Parenting", categoryId: "parenting" },
  ],
  konten: [
    { slug: "mistis", label: "Cerita Mistis & Horor", categoryId: "horror" },
    { slug: "motivasi", label: "Motivasi & Kehidupan", categoryId: "motivasi" },
    { slug: "edukasi", label: "Edukasi & Tips Harian", categoryId: "edukasi" },
    { slug: "keuangan", label: "Uang & Investasi", categoryId: "keuangan" },
    { slug: "curhat", label: "Curhat & Relationship", categoryId: "romance" },
    { slug: "sejarah", label: "Sejarah & Fakta Seru", categoryId: "sejarah" },
    { slug: "gaming", label: "Gaming", categoryId: "gaming" },
    { slug: "hiburan", label: "Hiburan", categoryId: "entertainment" },
    { slug: "musik", label: "Musik", categoryId: "music" },
    { slug: "olahraga", label: "Olahraga", categoryId: "sports" },
    { slug: "berita", label: "Berita & Viral", categoryId: "news" },
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
  gaming: [
    { key: "gamer-malino-tips", label: "Kayak pro gamer yang king sharps dan tips" },
    { key: "narator-quest", label: "Narator misi, bangun drama dari gameplay" },
    { key: "comedy-ngeti", label: "Comedy dan relate yang bikin ngeti" },
  ],
  hiburan: [
    { key: "reaksi-spontan", label: "Reaksi spontan dan kaget bikin bucal" },
    { key: "dramatis-penyint", label: "Dramatis, bikin penasaran terus nonton" },
    { key: "santai-ngobrol", label: "Santai kayak ngobrol sama teman" },
  ],
  musik: [
    { key: "ritmo-lirik", label: "Energi musik, fokus lirik dan ritmo" },
    { key: "nerd-behindscenes", label: "Facts musik dan cerita behind the scenes" },
    { key: "vibe-estetik", label: "Vibe estetik, bahasa kalem cinematic" },
  ],
  olahraga: [
    { key: "komentator-hipir", label: "Hipir komentator yang bikin degdegan" },
    { key: "analisis-taktik", label: "Analisis mendalam taktik dan strategi" },
    { key: "inspirasyon-atlet", label: "Inspiratif cerita atlet dan persisten" },
  ],
  berita: [
    { key: "cepat-point", label: "Gampang dicerna, cepat ke point" },
    { key: "investigatif-jelas", label: "Investigatif, fakta-fakta jelas dan objektiv" },
    { key: "viral-narrative", label: "Narativ viral yang bikin share" },
  ],
  otomotif: [
    { key: "spec-geeksus", label: "Gesus spec teknis, angka dan detail" },
    { key: "testdrive-kagum", label: "Reaksi test drive dan first-hand" },
    { key: "car-estetik", label: "Kalem estetik automotive" },
  ],
  kesehatan: [
    { key: "jelas-pelan", label: "Jelasin pelan-pelan biar ngerti" },
    { key: "serius-terpercaya", label: "Serius, fakta medical bisa dipercaya" },
    { key: "ngena-empatic", label: "Emphatic dan ngena kesehatan emosional" },
  ],
  rumah: [
    { key: "diari-makeover", label: "Diari makeover dan renovasi tahap-tahap" },
    { key: "budget-hack", label: "Hack budget dan dekor murah" },
    { key: "cozy-estetik", label: "Cozy estetik inspiratif biar bersik" },
  ],
  bayi: [
    { key: "jelas-parenting", label: "Jelasin gampang tips parenting" },
    { key: "hangat-experience", label: "Cerita pengalaman hangat dan relate" },
    { key: "ekspert-bayi", label: "Ekspert, fakta kesehatan bayi bisa dipercaya" },
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
  gaming: {
    "gamer-malino-tips": [
      { key: "g-tip-open", label: "Buka dgn tip kode gamer yang bikin pro" },
      { key: "g-clip-epic", label: "Pertenguhmid clipe epic ou clutch moment" },
      { key: "g-tutup-komunitet", label: "Tutup dgn call audiens komuniti" },
    ],
    "narator-quest": [
      { key: "g-hook-suspen", label: "Hook suspen dari misi ou momen tenk" },
      { key: "g-bangun-cha", label: "Bangun char yang bikin relate" },
      { key: "g-peak-climax", label: "Accel climaks saat plot twist ou boss" },
    ],
    "comedy-ngeti": [
      { key: "g-joke-relate", label: "Buka dgn joke yang gamer relate" },
      { key: "g-meme-nge", label: "Mix meme dan reaksi funny mid-game" },
      { key: "g-signoff", label: "Signoff catchy yang kena rir" },
    ],
  },
  hiburan: {
    "reaksi-spontan": [
      { key: "h-buka-kaget", label: "Buka dgn momen shocking yang spontan" },
      { key: "h-reaction-combo", label: "Chain reaksi funny tanpa script" },
      { key: "h-tutup-ques", label: "Tutup dgn pertanyaan open buat nonton" },
    ],
    "dramatis-penyint": [
      { key: "h-hook-misteri", label: "Hook misteri yang bikin penasaran" },
      { key: "h-build-degdegan", label: "Build degdegan sampai reveal" },
      { key: "h-cliffhanger", label: "Tutup cliffhanger biar nonton wait ulang" },
    ],
    "santai-ngobrol": [
      { key: "h-icebreak", label: "Buka kayak icebreaker hangat" },
      { key: "h-ngobrol-poin", label: "Ngobrol poin per poin natural" },
      { key: "h-tutup-sama", label: "Tutup santai sama ajak" },
    ],
  },
  musik: {
    "ritmo-lirik": [
      { key: "m-lirik-buka", label: "Buka dgn lirik yang bikin kaget" },
      { key: "m-analisis-beat", label: "Analisis ritmo dan beat yang terkait" },
      { key: "m-tutup-vibe", label: "Tutup dgn vibe yang kena dengerin" },
    ],
    "nerd-behindscenes": [
      { key: "m-fact-jarang", label: "Buka dgn fact musik yang jarang diketahui" },
      { key: "m-cerita-proses", label: "Cerita proses pembuatan lagu" },
      { key: "m-tutup-lesson", label: "Tutup dgn lesson yang bisa dinaplikasi" },
    ],
    "vibe-estetik": [
      { key: "m-visual-open", label: "Buka dgn visual estetik cinematic" },
      { key: "m-sensory", label: "Sensory dan emosional bahasa" },
      { key: "m-close-aesthetic", label: "Close aesthetic yang lingers" },
    ],
  },
  olahraga: {
    "komentator-hipir": [
      { key: "o-callout-open", label: "Buka dgn callout hiper momen big" },
      { key: "o-play-by-play", label: "Play-by-play degdegan" },
      { key: "o-tutup-energy", label: "Tutup dgn energi yang ngeti" },
    ],
    "analisis-taktik": [
      { key: "o-hook-pertanyaan", label: "Hook dgn pertanyaan taktik yang penting" },
      { key: "o-bedah-detail", label: "Bedah detail posisi dan strategi" },
      { key: "o-tutup-insight", label: "Tutup dgn insight yang bisa dipakai" },
    ],
    "inspirasyon-atlet": [
      { key: "o-cerita-start", label: "Buka dgn cerita atlet yang terduga" },
      { key: "o-latar-difultas", label: "Latar persisten dan difultas" },
      { key: "o-tutup-motivasi", label: "Tutup dgn poin motivasi yang kuat" },
    ],
  },
  berita: {
    "cepat-point": [
      { key: "b-lead-solat", label: "Buka dgn solat penting yang jarang diketa" },
      { key: "b-fakta-cepat", label: "Fakta cepat 1-2-3 gampang dicerna" },
      { key: "b-tutup-takes", label: "Tutup dgn takeaway yang urgent" },
    ],
    "investigatif-jelas": [
      { key: "b-claim-open", label: "Buka dgn claim yang jadi debat" },
      { key: "b-evidence-walk", label: "Walk fakta dan evidencias objektiv" },
      { key: "b-verdict-open", label: "Close verdict open-ended" },
    ],
    "viral-narrative": [
      { key: "b-hook-share", label: "Hook yang bikin orang share" },
      { key: "b-narativ-context", label: "Narativ dgn konteks yang relatable" },
      { key: "b-call-share", label: "Tutup dgn open call share/komen" },
    ],
  },
  otomotif: {
    "spec-geeksus": [
      { key: "t-spec-open", label: "Buka dgn spec yang bikin paham" },
      { key: "t-banding-kan", label: "Bandingkan spec lawan kompetitor" },
      { key: "t-tutup-value", label: "Tutup dgn value yang dipake inhen" },
    ],
    "testdrive-kagum": [
      { key: "t-impression-open", label: "Buka dgn first impression test drive" },
      { key: "t-experience-body", label: "Body cerita experience ring related" },
      { key: "t-tutup-concl", label: "Tutup dgn conclusion hones" },
    ],
    "car-estetik": [
      { key: "t-visual-open", label: "Buka dgn visual estetik auto" },
      { key: "t-detail-craft", label: "Detail craft dan design bahasa" },
      { key: "t-close-vibe", label: "Close dgn vibe yang memorable" },
    ],
  },
  kesehatan: {
    "jelas-pelan": [
      { key: "k-pelan-open", label: "Buka dgn mitos yang diklar" },
      { key: "k-step-jelas", label: "Step step jelasin tanpa jargon" },
      { key: "k-tutup-action", label: "Tutup dgn tip yang bisa dijalani" },
    ],
    "serius-terpercaya": [
      { key: "k-fakt-check", label: "Buka dgn fakta yang terpercaya" },
      { key: "k-source-body", label: "Body dgn sumber jelas dan jujur" },
      { key: "k-tutup-disclaimer", label: "Close dgn disclaimer responsif" },
    ],
    "ngena-empatic": [
      { key: "k-empatia-open", label: "Buka dgn empatia yang ngena" },
      { key: "k-konteks-ngenti", label: "Konteks yang bikin relate" },
      { key: "k-support-close", label: "Tutup dgn support dan encouragement" },
    ],
  },
  rumah: {
    "diari-makeover": [
      { key: "r-before-open", label: "Buka dgn before yang aneh" },
      { key: "r-tahap-reveal", label: "Tahap-tahap makeover reveal" },
      { key: "r-after-close", label: "Close after yang wau inspritif" },
    ],
    "budget-hack": [
      { key: "r-problem-open", label: "Buka dgn problem budget rumah" },
      { key: "r-hack-list", label: "Hack murah poin per poin" },
      { key: "r-tutup-save", label: "Tutup dgn jumlah save yang mempe" },
    ],
    "cozy-estetik": [
      { key: "r-cozy-open", label: "Buka dgn vibe cozy yang hangat" },
      { key: "r-detail-dcoor", label: "Detail dekor yang bisa dicopy" },
      { key: "r-tutup-fed", label: "Tutup satisfed dan estetik" },
    ],
  },
  bayi: {
    "jelas-parenting": [
      { key: "p-pertanyaan-open", label: "Buka dgn pertanyaan parenting common" },
      { key: "p-tips-jelas", label: "Tips jelasin pelan-pelan" },
      { key: "p-tutup-reassure", label: "Tutup dgn reassurance hangat" },
    ],
    "hangat-experience": [
      { key: "p-cerita-buka", label: "Buka dgn cerita pengalaman kong kretku" },
      { key: "p-bangunan-relate", label: "Bangun relate saat fase parenting" },
      { key: "p-tutup-ngena", label: "Tutup dgn poin yang ngena hati" },
    ],
    "ekspert-bayi": [
      { key: "p-fakt-buka", label: "Buka dgn fakta health bayi terpercaya" },
      { key: "p-source-buang", label: "Bedah jujur apa terpercaya" },
      { key: "p-tutup-besi", label: "Tutup dgn best practice charger" },
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