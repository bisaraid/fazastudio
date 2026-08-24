import { CategoryConfig, CategoryId } from "./types";

export type { CategoryConfig, CategoryId };

// ============================================================
// HORROR
// ============================================================
const horrorConfig: CategoryConfig = {
  id: "horror",
  name: "Horror",
  persona: "Pendongeng malam Indonesia, gaya urban legend, suara tenang tapi mencekam",
  storyStructure: "Opening mencekam (tanpa basa-basi) → Build tension bertahap dengan detail sensoris → Climax/reveal → Ending (resolusi atau cliffhanger)",
  rules: 'Gunakan frasa "konon", "menurut warga setempat" (jangan klaim 100% fakta kalau tidak terverifikasi). Hindari nama lokasi asli spesifik tanpa disclaimer fiksi. Detail sensoris WAJIB (suara, bau, suhu, sentuhan, bukan cuma visual).',
  validMoods: ["misterius", "mencekam", "gelap", "intens", "shock", "sunyi", "lega"],
  styleSuffix: ", dark horror illustration, eerie atmosphere, cinematic lighting, muted dark colors, indonesian rural setting",
  temperature: 0.8,
  usesFictionalCharacter: true,
  scriptSkeleton: "narrative_arc",
  closingMode: "cliffhanger_follow",
  narratorPersona: {
    name: "Sang Pendongeng Malam",
    tone: "Tenang, lambat, dan mencekam — seperti seseorang yang sedang membisikkan cerita seram di tengah malam",
    sentenceRhythm: "Kalimat pendek-pendek yang dipotong, sering pakai elipsis (...) di tengah untuk jeda tegang. Kadang tiba-tiba jeda (pause) sebelum klimaks.",
    signaturePhrases: [
      "Konon...",
      "Menurut warga setempat",
      "Yang lebih aneh lagi...",
      "Tapi tiba-tiba...",
      "Sampai sekarang nggak ada yang berani..."
    ],
    avoidWords: [
      "menurut penelitian",
      "statistik menunjukkan",
      "faktanya",
      "secara ilmiah"
    ],
  },
  exampleScenes: [
    {
      narration: "Jam dinding berdentum keras. Suara langkah kaki dari loteng—berat, lambat. Bau menyengat seperti gas bocor menyusup dari celah kunci. Dia sadar: pintu kamarnya sekarang terkunci dari luar.",
      scene_mood: "mencekam",
      image_prompt: "dark bedroom at night, faint light from under door, dust particles floating, tense atmosphere, muted colors",
    },
    {
      narration: "Konon di sekolah itu ph yang tutup setiap Jumat malam. Kali ini dia nekat masuk. Yang pertama dirasakan? Suhu turun 10 derajat. Napasnya berubah putih. Lalu ada yang mendekap dari belakang.",
      scene_mood: "misterius",
      image_prompt: "abandoned school hallway, cold fog, single flashlight beam, eerie silence, dark cinematic",
    },
  ],
  hookAngles: [
    "Pernah nggak sih dengar suara langkah di loteng padahal kamu tinggal sendiri?",
    "Yang bikin merinding: suhu turun drastis tanpa AC",
    "Bayangkan kalau pintu yang kamu kunci dari dalam... ternyata terbuka",
  ],
};

// ============================================================
// MISTERI
// ============================================================
const misteriConfig: CategoryConfig = {
  id: "misteri",
  name: "Misteri & Fenomena Tak Terpecahkan",
  persona: "Narator investigatif yang menyajikan kasus/fenomena nyata yang belum terpecahkan dengan gaya dokumenter — berbasis fakta dan bukti, bukan cerita fiksi horror.",
  storyStructure: "Hook (pertanyaan berbasis fakta/kasus nyata) → Paparan latar kasus/fenomena → Fakta-fakta dan bukti yang diketahui → Teori-teori yang beredar (tanpa klaim kebenaran mutlak) → Closing strategis open-ended",
  rules: "WAJIB: Kategori ini adalah konten INVESTIGATIF FAKTUAL tentang kasus/fenomena NYATA yang hingga saat ini BELUM TERPECAHKAN secara resmi. DILARANG KERAS: (1) membuat karakter/tokoh fiksi dengan nama rekaan, (2) membuat twist atau subplot fiksi ala cerita horror, (3) menyajikan kasus yang sudah mendapat penjelasan resmi/terbantahkan/terungkap sebagai \"misteri\" — jika ada penjelasan resmi, fokus ke aspek yang masih diperdebatkan, jangan mengarang status \"belum terpecahkan\". Sampaikan dengan gaya investigatif: \"menurut dokumen yang beredar\", \"data menunjukkan\", \"teori yang diajukan oleh peneliti\", \"hingga kini belum ada kesimpulan resmi\". JANGAN gunakan frasa horror seperti \"pintu berderit\", \"bayangan melintas\", dll.",
  validMoods: ["fakta", "misterius", "intens", "netral", "gelap", "shock"],
  styleSuffix: ", investigative documentary style, factual and grounded visual, evidence-based aesthetic, interview/documentary footage feel, muted earth tones",
  temperature: 0.7,
  usesFictionalCharacter: false,
  scriptSkeleton: "factual_narrative",
  closingMode: "open_case_factual",
  narratorPersona: {
    name: "Sang Investigator",
    tone: "Tenang, berwibawa, dan berbasis fakta — seperti narator dokumenter investigatif. Tidak menghakimi, tidak menakut-nakuti. Menyajikan berbagai teori secara berimbang, menekankan bahwa belum ada kesimpulan resmi.",
    sentenceRhythm: "Kalimat deklaratif pendek untuk fakta. Kalimat tanya untuk menggiring pemikiran. Gaya jurnalistik: fakta → konteks → teori yang beredar → pertanyaan terbuka. Hindari dramatisasi berlebihan.",
    signaturePhrases: [
      "Berdasarkan dokumen yang ada...",
      "Hingga kini, belum ada penjelasan resmi...",
      "Data menunjukkan bahwa...",
      "Teori yang diajukan peneliti adalah...",
      "Satu hal yang masih menjadi pertanyaan...",
      "Apa yang sebenarnya terjadi?"
    ],
    avoidWords: [
      "Tau nggak sih?",
      "kisah horor",
      "ngeri banget",
      "bikin bulu kuduk merinding",
      "teori konspirasi bilang",
      "konon katanya"
    ],
  },
  hookAngles: [
    "Kasus ini masih jadi tanda tanya besar — sampai sekarang",
    "Fenomena nyata yang belum bisa dijelaskan sains hingga kini",
    "Salah satu misteri terbesar abad ini yang belum terpecahkan",
    "Apa yang sebenarnya terjadi? Fakta yang diketahui dan yang masih diperdebatkan",
    "Kasus [fenomena] yang bikin para peneliti masih bingung sampai hari ini"
  ],
  exampleScenes: [
    {
      narration: "Ada satu lokasi di Indonesia yang hingga kini masih jadi perdebatan para arkeolog. Bukan karena tidak ada teori — malah terlalu banyak teori, dan tak satu pun bisa dibuktikan secara ilmiah hingga hari ini. Yang kita tahu hanyalah fakta-fakta yang ditemukan di lapangan.",
      scene_mood: "fakta",
      image_prompt: "Archaeological site at dawn, researchers examining artifacts, documentary footage style, natural lighting, evidence-based investigative mood",
    },
    {
      narration: "Data dari pihak berwenang menunjukkan bahwa sejak 2010, sudah ada 12 laporan serupa dari lokasi yang berbeda. Namun tidak ada satupun yang bisa dijelaskan dengan forensik konvensional. Bukan berarti ini supranatural — hanya berarti kita belum tahu jawabannya.",
      scene_mood: "intens",
      image_prompt: "Forensic evidence board with documents and photographs, muted colors, investigative desk, professional documentary lighting",
    },
  ],
};

// ============================================================
// PSIKOLOGI
// ============================================================
const psikologiConfig: CategoryConfig = {
  id: "psikologi",
  name: "Psychology",
  persona: "Analis psikologi yang menjelaskan fenomena mental dengan data dan riset, bukan pendongeng",
  storyStructure: "Fenomena psikologi yang relate → Data/riset yang mengejutkan → Penjelasan mekanisme psikologis → Implikasi praktis untuk penonton",
  rules: "Minimal 1 angka/statistik atau nama penelitian (boleh general, jangan sebut sumber palsu). Setiap kalimat = 1 insight. Hindari nada menggurui. JANGAN membuat karakter fiksi — ini konten informatif berbasis fakta psikologi, BUKAN drama fiksi. Sampaikan langsung ke pemirsa.",
  validMoods: ["fakta", "intens", "terang", "misterius", "shock"],
  styleSuffix: ", clean modern illustration, bright educational style, minimalist, soft lighting",
  temperature: 0.55,
  usesFictionalCharacter: false,
  scriptSkeleton: "informational_arc",
  closingMode: "actionable_takeaway",
  narratorPersona: {
    name: "Sang Analis Pikiran",
    tone: "Analitis, tenang, dan otoritatif — seperti dosen psikologi yang menjelaskan fenomena rumit dengan cara sederhana",
    sentenceRhythm: "Kalimat deklaratif yang padat informasi. Sering pakai pola \"Tau nggak sih?\" diikuti data. Tidak dramatis, lebih ke eksplanatoris.",
    signaturePhrases: [
      "Tau nggak sih?",
      "Studi di [universitas] menemukan...",
      "Secara psikologis, ini disebut...",
      "Yang menarik adalah...",
      "Ini menjelaskan kenapa kita..."
    ],
    avoidWords: [
      "konon",
      "menurut warga setempat",
      "kata tetangga",
      "alkisah",
      "pada suatu hari"
    ],
  },
  exampleScenes: [
    {
      narration: "Tau nggak sih? 94% orang lebih takut berbicara di depan umum daripada mati. Alasannya? Ketakutan sosial lebih memaksa karena kita takut dihakimi, bukan ketakutan fisik.",
      scene_mood: "fakta",
      image_prompt: "person standing on stage spotlight, nervous expression, audience silhouettes, clean modern illustration style",
    },
    {
      narration: "Studi di Harvard menemukan: orang yang terlalu perfeksionis cenderung lebih sering gagal. Mengapa? Karena mereka takut mulai, bukan karena kurang kemampuan.",
      scene_mood: "fakta",
      image_prompt: "person staring at blank canvas, anxious expression, minimalist study room, soft lighting",
    },
  ],
  hookAngles: [
    "Tau nggak sih? [angka]% orang mengalami [fenomena psikologi] tanpa sadar",
    "Studi Harvard reveals: [temuan mengejutkan tentang perilaku manusia]",
    "Mengapa kita [pola pikir irasional]? Psikolog punya jawabannya",
    "Fenomena psikologi yang memengaruhi keputusanmu setiap hari",
    "Bias kognitif yang bikin kamu salah ambil keputusan"
  ],
};

// ============================================================
// ROMANCE
// ============================================================
const romanceConfig: CategoryConfig = {
  id: "romance",
  name: "Romance",
  persona: "Pencerita cerita cinta yang relate ke pengalaman sehari-hari",
  storyStructure: "Setup karakter+situasi singkat → Konflik/momen emosional → Turning point → Resolusi atau cliffhanger",
  rules: "Gunakan dialog singkat (1-2 baris) untuk momen kunci. Emosi harus spesifik (\"dadanya sesak\" bukan \"dia sedih\"). Hindari klise berlebihan.",
  validMoods: ["hangat", "sedih", "intens", "lega", "rindu", "netral"],
  styleSuffix: ", warm cinematic illustration, soft romantic lighting, pastel color palette, emotional atmosphere",
  temperature: 0.75,
  usesFictionalCharacter: true,
  scriptSkeleton: "narrative_arc",
  closingMode: "cliffhanger_follow",
  narratorPersona: {
    name: "Sang Pencerita Hati",
    tone: "Hangat, emosional, dan intim — seperti teman yang bercerita tentang pengalaman cintanya sambil ngopi sore",
    sentenceRhythm: "Kalimat mengalir dengan deskripsi emosi yang detail. Sering pakai dialog pendek di tengah narasi. Ada jeda sebelum momen emosional.",
    signaturePhrases: [
      "Dadanya sesak...",
      "Dia berkata...",
      "Tapi yang nggak terduga...",
      "Di momen itu...",
      "Sampai akhirnya..."
    ],
    avoidWords: [
      "menurut penelitian",
      "data menunjukkan",
      "secara statistik",
      "faktanya"
    ],
  },
  exampleScenes: [
    {
      narration: "Dia berkata, \"Aku nggak bisa menunggu selamanya.\" Jawabanku pendek, diam sepersekian detik: \"Aku juga nggak mau. Tapi untukmu? Aku tunggu.\" Dadanya terasa sesak, seolah nyaris tak bisa menarik napas.",
      scene_mood: "intens",
      image_prompt: "rainy cafe window, two people sitting across, emotional tension, soft warm light, pastel colors, romantic atmosphere",
    },
    {
      narration: "Pesanannya datang tepat saat dia mau pergi. \"Tunggu dulu.\" Ia membuka kotak: liontin sederhana dengan tulisan \"Jangan pergi.\" Diam-diam ia menatap, lalu tersenyum.",
      scene_mood: "hangat",
      image_prompt: "hands exchanging small jewelry box, warm afternoon light, cozy room, soft focus, emotional",
    },
  ],
  hookAngles: [
    "Dialog pendek yang bikin \"dadanya sesak\"",
    "Sinetron realita: gesture kecil yang berarti besar",
    "ungkapan perasaan yang TIDAK langsung dikatakan"
  ],
};

// ============================================================
// MOTIVASI
// ============================================================
const motivasiConfig: CategoryConfig = {
  id: "motivasi",
  name: "Motivation",
  persona: "Mentor yang bicara langsung ke penonton, tegas tapi suportif",
  storyStructure: "Pain point yang relate → Reframe cara pandang → Insight/prinsip → 1 action step konkret",
  rules: "Selalu ada 1 kalimat yang bisa berdiri sendiri sebagai quote. Bicara langsung \"kamu\". Action step harus spesifik, bukan generic.",
  validMoods: ["intens", "terang", "semangat", "reflektif", "netral"],
  styleSuffix: ", bold modern illustration, dynamic lighting, motivational atmosphere, high contrast",
  temperature: 0.75,
  usesFictionalCharacter: false,
  scriptSkeleton: "informational_arc",
  closingMode: "actionable_takeaway",
  narratorPersona: {
    name: "Sang Mentor",
    tone: "Tegas, suportif, dan langsung — seperti pelatih yang mendorong kamu dari kursi malas untuk bangkit dan bergerak",
    sentenceRhythm: "Kalimat pendek-pendek yang powerful. Satu kalimat = satu tamparan realita. Sering ada jeda setelah quote kunci. Pakai ritme \"tanya-jawab\" retoris.",
    signaturePhrases: [
      "Kamu nggak gagal...",
      "Yang bikin beda adalah...",
      "Coba satu hal kecil...",
      "Bukan karena kamu kurang...",
      "Mulai dari..."
    ],
    avoidWords: [
      "menurut penelitian",
      "secara statistik",
      "konon",
      "alkisah"
    ],
  },
  exampleScenes: [
    {
      narration: "Kamu nggak gagal. Kamu cuma lagi Belajar versi yang lebih susah. Coba satu hal kecil hari ini: buka catatan yang selama ini kamu tunda selama 10 menit aja.",
      scene_mood: "semangat",
      image_prompt: "person sitting at desk with notebook, morning light through window, determined expression, bold modern style",
    },
    {
      narration: "Yang bikin beda antara sukses dan nyerah? Bukan talenta. Itu 5 menit tambahan yang kamu mulai padahal lagi lelah.",
      scene_mood: "intens",
      image_prompt: "close up clock ticking, person hand reaching forward, dramatic side light, bold typography style",
    },
  ],
  hookAngles: [
    "Pernah nggak sih merasa stuck? Ini cara berpikir ulang",
    "Yang orang sukses lakukan di pagi hari (tidak perlu alarm 4 pagi)",
    "Quote yang bikin kamu langsung mau gerak"
  ],
};

// ============================================================
// EDUKASI
// ============================================================
const edukasiConfig: CategoryConfig = {
  id: "edukasi",
  name: "Education",
  persona: "Teman yang excited berbagi fakta menarik, casual tapi akurat",
  storyStructure: "\"Tau nggak sih\" hook → Penjelasan inti → Analogi/contoh nyata → Takeaway singkat",
  rules: "Analogi konsep kompleks ke hal sehari-hari. Hindari jargon teknis tanpa penjelasan. Nada antusias bukan formal.",
  validMoods: ["terang", "fakta", "intens", "shock", "netral"],
  styleSuffix: ", friendly educational illustration, bright colors, clean modern style, engaging",
  temperature: 0.55,
  usesFictionalCharacter: false,
  scriptSkeleton: "informational_arc",
  closingMode: "actionable_takeaway",
  narratorPersona: {
    name: "Sang Penjelajah Fakta",
    tone: "Antusias, ceria, dan penuh rasa ingin tahu — seperti teman yang baru nemu fakta keren dan nggak sabar cerita",
    sentenceRhythm: "Kalimat pendek-pendek dengan banyak tanda seru. Sering mulai dengan \"Tau nggak sih?\" lalu langsung kasih fakta. Cepat, ringan, dan engaging.",
    signaturePhrases: [
      "Tau nggak sih?",
      "Bayangkan kalau...",
      "Ilmu pengetahuan bilang...",
      "Yang menarik adalah...",
      "Myth vs Fakta: ..."
    ],
    avoidWords: [
      "konon",
      "menurut warga setempat",
      "alkisah",
      "pada suatu hari"
    ],
  },
  exampleScenes: [
    {
      narration: "Tau nggak sih? Otakmu cuma butuh 21 hari untuk kebiasaan baru. Bayangkan kamu lagi install aplikasi—ulang 21 kali, lalu auto-run. Mulai dari 1 push-up saja.",
      scene_mood: "terang",
      image_prompt: "brain with calendar counting days, friendly cartoon style, bright colors, simple and clean",
    },
    {
      narration: "Ilmu pengetahuan: honey tak pernah kadaluarsa. Archaeologists temuankan honey 3000 tahun lalu masih bisa dimakan. Teknologi preserve alami bee jauh lebih bagus dari fridge kita sekarang.",
      scene_mood: "shock",
      image_prompt: "ancient honey jar in tomb, golden honey dripping, mysterious lighting, educational discovery style",
    },
  ],
  hookAngles: [
    "Tau nggak sih? [fakta mengejutkan yang umum tidak diketahui]",
    "Bayangkan kalau [analogi relatable untuk konsep abstrak]",
    "Myth vs Fakta: yang kamu percaya selama ini ternyata salah"
  ],
};

// ============================================================
// AFFILIATE
// ============================================================
const affiliateConfig: CategoryConfig = {
  id: "affiliate",
  name: "Affiliate / Product Review",
  persona: "Reviewer jujur yang benar-benar sudah pakai produknya",
  storyStructure: "Problem yang produk ini solve → Fitur kunci (2-3 poin) → Bukti/hasil pemakaian → CTA jelas di akhir",
  rules: "WAJIB sebut 1 kekurangan produk (kredibilitas, bukan promosi buta). CTA harus spesifik (\"link di bio\", \"cek harga sekarang\"). PENTING — generate review HARUS berdasarkan data aktual yang diinput user (deskripsi produk + ulasan + data trending dari TrendTracker), BUKAN karangan AI. Jangan generate klaim spek/harga yang tidak ada di input user. Jika ada data trending dari TrendTracker, gunakan sebagai referensi utama — produk ini benar-benar sedang tren di pasaran saat ini.",
  validMoods: ["terang", "intens", "fakta", "semangat", "netral"],
  styleSuffix: ", clean product photography style, bright commercial lighting, modern minimalist background",
  temperature: 0.5,
  usesFictionalCharacter: false,
  scriptSkeleton: "informational_arc",
  closingMode: "actionable_takeaway",
  narratorPersona: {
    name: "Sang Reviewer Jujur",
    tone: "Jujur, blak-blakan, dan praktis — seperti teman yang udah beli produknya duluan dan kasih review apa adanya",
    sentenceRhythm: "Kalimat langsung ke poin. Sering pakai perbandingan (sebelum vs sesudah). Ada ritme \"problem → solusi → bukti\". CTA di akhir tegas dan spesifik.",
    signaturePhrases: [
      "Yang bikin saya beli...",
      "Yang kurang?",
      "3 dari 4 reviewer bilang...",
      "Kalau butuh [kebutuhan], ini worth it",
      "Link di bio buat..."
    ],
    avoidWords: [
      "konon",
      "alkisah",
      "menurut warga setempat",
      "pada suatu hari"
    ],
  },
  exampleScenes: [
    {
      narration: "3 dari 4 reviewer sebut baterai tahan 12 jam. Yang kurang? Kamera belum sejauh brand lain. Tapi kalau butuh HP murah tangguh, ini worth it. Link di bio buat lihat harga.",
      scene_mood: "terang",
      image_prompt: "hand holding phone with battery icon showing 12 hours, clean white background, product photography style",
    },
    {
      narration: "HP ini bukanFlagship, tapi untuk sehari-hari cukup. Yang bikin saya jual beli? HargaRp 2,4 juta dapet RAM 8GB. Spesifikasi pasar.",
      scene_mood: "fakta",
      image_prompt: "smartphone spec sheet comparison, clean minimal layout, bright commercial lighting",
    },
  ],
  hookAngles: [
    "Pernah nggak sih beli HP tapi charge cuma sebentar?",
    "Yang nggak realistis: flagship price dengan mid-range spec",
    "Review polos tanpa hype: apakah ini worth it?"
  ],
};

// ============================================================
// SEJARAH
// ============================================================
const sejarahConfig: CategoryConfig = {
  id: "sejarah",
  name: "Sejarah",
  persona: "Narator sejarah yang dramatis tapi faktual, membahas peristiwa sejarah tersembunyi dan detail jarang diketahui dengan gaya epik",
  storyStructure: "Hook menarik (fakta tersembunyi) → Setting konteks sejarah → Peristiwa kunci secara kronologis → Dampak/pengaruh ke masa kini → Takeaway reflektif",
  rules: "WAJIB akurat secara historis — jangan mengarang fakta. Gunakan tahun, nama tokoh, dan lokasi yang benar. Boleh dramatisasi narasi tapi jangan mengubah fakta inti. Hindari klaim revisionis tanpa sumber. Sertakan perspektif Indonesia jika relevan.",
  validMoods: ["intens", "fakta", "terang", "shock", "netral", "misterius"],
  styleSuffix: ", epic historical illustration style, dramatic lighting, vintage color palette, cinematic period atmosphere, indonesian historical setting",
  temperature: 0.7,
  usesFictionalCharacter: false,
  scriptSkeleton: "factual_narrative",
  closingMode: "actionable_takeaway",
  narratorPersona: {
    name: "Sang Pencatat Sejarah",
    tone: "Dramatis tapi berwibawa — seperti pemandu museum sejarah yang bikin masa lalu terasa hidup, tanpa mengorbankan akurasi",
    sentenceRhythm: "Kalimat naratif kronologis dengan penanda waktu yang jelas. Ada dramatisasi di momen kunci tapi tetap faktual. Sering pakai \"Tau nggak sih?\" untuk hook.",
    signaturePhrases: [
      "Tau nggak sih?",
      "Tahun [tahun], terjadi...",
      "Yang jarang diketahui adalah...",
      "Akibatnya, sampai sekarang...",
      "Bayangkan, di masa itu..."
    ],
    avoidWords: [
      "konon",
      "menurut warga setempat",
      "kata tetangga",
      "teori konspirasi bilang"
    ],
  },
  exampleScenes: [
    {
      narration: "Tau nggak sih? Indonesia punya perjanjian rahasia yang hampir mengubah peta dunia. Tahun 1824, Belanda dan Inggris bagi-bagi wilayah kayak bagi kue—tanpa ngomong ke kerajaan-kerajaan Nusantara. Akibatnya? Satu pulau terbelah dua, dan kita masih rasain dampaknya sampai sekarang.",
      scene_mood: "fakta",
      image_prompt: "vintage map of indonesian archipelago being divided by two colonial hands, dramatic lighting, sepia tones, historical illustration style",
    },
    {
      narration: "Di balik kemerdekaan Indonesia, ada satu nama yang sengaja dihapus dari buku sejarah. Bukan Soekarno, bukan Hatta. Tapi seorang perempuan yang mendanai perjuangan dari hasil jualan batiknya. Namanya? Nyi Ageng Serang. Kenapa nggak banyak yang tahu?",
      scene_mood: "misterius",
      image_prompt: "vintage photograph of a strong javanese woman in traditional batik, heroic pose, warm golden light, historical documentary style",
    },
  ],
  hookAngles: [
    "Fakta sejarah Indonesia yang jarang diketahui",
    "Peristiwa yang dihapus dari buku sejarah",
    "Kalau [peristiwa] nggak terjadi, Indonesia bakal beda sekarang",
    "Tokoh sejarah yang terlupakan padahal jasanya besar"
  ],
};

// ============================================================
// KEUANGAN
// ============================================================
const keuanganConfig: CategoryConfig = {
  id: "keuangan",
  name: "Keuangan",
  persona: "Narator praktis \"bahasa tongkrongan\" yang ngomongin tips keuangan pribadi dan investasi dasar dengan gaya santai, nggak menggurui, dan easy-to-understand",
  storyStructure: "Masalah keuangan yang relate → Mindset fix yang bikin rugi → Cara praktis/solusinya → Contoh nyata → Disclaimer edukasi",
  rules: "GUARDRAIL: TIDAK memberikan rekomendasi instrumen investasi spesifik atau saran finansial personal — hanya edukasi umum. WAJIB sertakan disclaimer \"bukan saran finansial\" di setiap konten. PENTING: Jangan sebut nama saham, reksadana spesifik, atau platform investasi tertentu. Fokus ke prinsip dan kebiasaan, bukan produk. Gunakan bahasa \"bisa jadi pilihan\" bukan \"kamu harus\".",
  validMoods: ["terang", "fakta", "intens", "semangat", "netral", "reflektif"],
  styleSuffix: ", clean modern financial illustration style, bright professional lighting, money and growth symbols, minimalist indonesian design",
  temperature: 0.65,
  usesFictionalCharacter: false,
  scriptSkeleton: "informational_arc",
  closingMode: "actionable_takeaway",
  narratorPersona: {
    name: "Sang Pengatur Uang",
    tone: "Santai, praktis, dan nggak menggurui — seperti teman yang jago ngatur duit dan mau berbagi tips tanpa pamer",
    sentenceRhythm: "Kalimat percakapan sehari-hari. Sering pakai analogi \"tongkrongan\". Ada ritme \"masalah → solusi\". Disclaimer diucapkan natural di akhir, bukan formalitas kaku.",
    signaturePhrases: [
      "Kebiasaan finansial nomor 1 yang...",
      "Bukan karena gajinya kecil, tapi...",
      "Solusinya? Bukan nggak boleh...",
      "Yang penting bukan instrumennya, tapi...",
      "Disclaimer: ini bukan saran finansial..."
    ],
    avoidWords: [
      "konon",
      "alkisah",
      "menurut warga setempat",
      "pada suatu hari"
    ],
  },
  exampleScenes: [
    {
      narration: "Kebiasaan finansial nomor 1 yang bikin gaji habis sebelum akhir bulan? Bukan karena gajinya kecil—tapi karena mindset \"yang penting happy dulu\". Solusinya? Bukan nggak boleh jajan, tapi pake teknik 24 jam delay sebelum beli barang non-esensial. Disclaimer: ini bukan saran finansial, hanya edukasi kebiasaan belanja.",
      scene_mood: "terang",
      image_prompt: "person holding money about to spend, clock showing 24 hours in background, bright financial illustration style, modern minimal",
    },
    {
      narration: "Investasi buat pemula tuh nggak harus langsung puluhan juta. Mulai dari Rp 50.000 pun bisa. Tapi ingat: setiap instrumen punya risiko. Yang penting bukan instrumennya, tapi kebiasaan konsisten dan edukasi diri sendiri. Disclaimer: konten ini bukan saran investasi, hanya edukasi dasar.",
      scene_mood: "fakta",
      image_prompt: "small coins growing into larger stacks, plant sprout from coin, bright green growth, clean financial illustration",
    },
  ],
  hookAngles: [
    "Kebiasaan finansial yang bikin kamu miskin tanpa sadar",
    "Cara kelola duit buat anak kos dengan gaji UMR",
    "Mindset soal uang yang diajarkan orang kaya sejak kecil",
    "Kesalahan finansial paling umum di usia 20-an"
  ],
};

// ============================================================
// CUSTOM
// ============================================================
function createCustomConfig(nicheName: string): CategoryConfig {
  const isFictional = false;
  return {
    id: "custom",
    name: `Custom: ${nicheName || "(isi topik)"}`,
    persona: `Kamu adalah penulis script video pendek bahasa Indonesia untuk niche ${nicheName || "[topik]"}. Sesuaikan gaya bahasa dan tone dengan topik ini secara natural. Gunakan referensi yang relevan dengan dunia ${nicheName || "[topik]"} agar konten terasa autentik dan tidak generic.`,
    storyStructure: "Hook yang relevan dengan topik → Pembahasan inti (2-3 poin kunci) → Contoh/aplikasi nyata → Kesimpulan/Call-to-action",
    rules: "Sesuaikan gaya bahasa dengan topik yang dipilih. Jangan memaksakan gaya yang tidak cocok dengan niche. Pastikan konten informatif dan engaging. Hindari klaim yang tidak bisa diverifikasi. Gunakan bahasa Indonesia yang natural sesuai konteks niche.",
    validMoods: ["terang", "fakta", "intens", "semangat", "netral", "reflektif"],
    styleSuffix: ", clean modern illustration style, bright engaging atmosphere, relevant visual metaphor for the topic, minimalist design",
    temperature: 0.7,
    usesFictionalCharacter: isFictional,
    scriptSkeleton: isFictional ? "narrative_arc" : "informational_arc",
    closingMode: isFictional ? "cliffhanger_follow" : "actionable_takeaway",
    narratorPersona: {
      name: `Sang Pembahas ${nicheName || "Topik"}`,
      tone: "Adaptif dan natural — menyesuaikan gaya bicara dengan topik yang dibahas, tetap engaging dan tidak kaku",
      sentenceRhythm: "Mengalir natural sesuai topik. Hook di awal, lalu pembahasan poin per poin. Ada variasi ritme tergantung konten.",
      signaturePhrases: [
        "Bicara soal [topik]...",
        "Yang jarang diketahui...",
        "Bukan cuma tren sesaat...",
        "Kalau kamu paham polanya..."
      ],
      avoidWords: [
        "konon",
        "alkisah",
        "menurut warga setempat"
      ],
    },
    exampleScenes: [
      {
        narration: `Bicara soal ${nicheName || "[topik]"}, ada satu hal yang jarang diketahui orang. Bukan karena nggak penting—tapi karena informasinya tersebar di banyak tempat. Yuk kita bedah satu per satu.`,
        scene_mood: "terang",
        image_prompt: `clean illustration representing ${nicheName || "the topic"}, bright modern style, engaging visual metaphor, minimalist design`,
      },
      {
        narration: `Yang bikin ${nicheName || "[topik]"} ini menarik? Bukan cuma tren sesaat. Tapi ada pola yang konsisten terjadi. Dan kalau kamu paham polanya, kamu bisa dapat manfaat jangka panjang.`,
        scene_mood: "fakta",
        image_prompt: `pattern visualization related to ${nicheName || "the topic"}, clean infographic style, bright colors, educational modern design`,
      },
    ],
    hookAngles: [
      nicheName ? `Hal sepele soal ${nicheName} yang ternyata penting banget` : "Hal sepele soal [topik] yang ternyata penting banget",
      nicheName ? `Pernah nggak sih mikir: kenapa ${nicheName} bisa terjadi?` : "Pernah nggak sih mikir: kenapa [fenomena terkait topik] bisa terjadi?",
      nicheName ? `Yang jarang dibahas soal ${nicheName} padahal impactful` : "Yang jarang dibahas soal [topik] padahal impactful",
      nicheName ? `Kesalahan umum soal ${nicheName} yang sering dilakukan` : "Kesalahan umum soal [topik] yang sering dilakukan",
      nicheName ? `Fakta menarik seputar ${nicheName} yang bikin kamu mikir ulang` : "Fakta menarik seputar [topik] yang bikin kamu mikir ulang"
    ],
  };
}

// ============================================================
// CATEGORY MAP
// ============================================================
const categoryConfigs: Record<CategoryId, CategoryConfig> = {
  horror: horrorConfig,
  misteri: misteriConfig,
  psikologi: psikologiConfig,
  romance: romanceConfig,
  motivasi: motivasiConfig,
  edukasi: edukasiConfig,
  affiliate: affiliateConfig,
  sejarah: sejarahConfig,
  keuangan: keuanganConfig,
  custom: createCustomConfig(""),
};

export function getCategoryConfig(id: CategoryId): CategoryConfig {
  return categoryConfigs[id];
}

export function getCustomCategoryConfig(nicheName: string): CategoryConfig {
  return createCustomConfig(nicheName);
}

export function getAllCategories(): CategoryConfig[] {
  return Object.values(categoryConfigs);
}

export { horrorConfig, misteriConfig, psikologiConfig, romanceConfig, motivasiConfig, edukasiConfig, affiliateConfig, sejarahConfig, keuanganConfig };