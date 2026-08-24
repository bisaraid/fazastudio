/**
 * Closing Engagement Strategies — Terpusat untuk Semua Kategori (ACS)
 *
 * Setiap kategori punya 5 strategi unik dengan anti-repeat mechanism.
 * Tiap strategi punya promptHint yang SPESIFIK ke strategi dan mengandung
 * instruksi variasi diksi supaya output AI tidak identik meski topik/trend sama.
 */

export interface ClosingStrategy {
  id: string;
  label: string;
  promptHint: string;
  exampleClosing: string;
}

// ============================================================
// MISTERI (dari sprint 3 awal — TIDAK DIUBAH)
// ============================================================

const misteriStrategies: ClosingStrategy[] = [
  {
    id: "split_opinion",
    label: "Split Opinion",
    promptHint:
      "Tutup dengan mengundang audiens memilih di antara 2 sudut pandang/teori yang berbeda soal kasus ini. Rumuskan kalimat original berdasarkan teori yang sudah dibahas di video ini — jangan tulis contoh kalimat template.",
    exampleClosing:
      "Jadi menurut kamu, apakah ini murni kebetulan — atau ada pola yang sengaja disembunyikan? Pilih di kolom komentar: teori A atau teori B?",
  },
  {
    id: "withheld_detail",
    label: "Withheld Detail",
    promptHint:
      "Tutup dengan menyinggung ada detail/petunjuk tambahan yang belum dibahas tuntas di video ini, sebagai alasan organik untuk follow/nantikan lanjutan — HANYA jika memang ada detail nyata yang relevan dari topik, jangan mengarang.",
    exampleClosing:
      "Tapi ada satu detail dari laporan terakhir yang mungkin mengubah semuanya. Sayangnya, itu cerita untuk video berikutnya — follow biar nggak ketinggalan.",
  },
  {
    id: "crowd_source_info",
    label: "Crowd Source Info",
    promptHint:
      "Tutup dengan mengundang audiens yang mungkin punya informasi tambahan soal kasus ini untuk berbagi di kolom komentar.",
    exampleClosing:
      "Kalau kamu atau keluarga punya pengalaman langsung soal kasus ini, bagikan di kolom komentar — mungkin kamu punya informasi yang belum diketahui publik.",
  },
  {
    id: "official_vs_public_gap",
    label: "Official vs Public Gap",
    promptHint:
      "Tutup dengan menyoroti kesenjangan antara penjelasan resmi dan keyakinan yang beredar di masyarakat, tanpa menghakimi mana yang benar.",
    exampleClosing:
      "Penjelasan resmi sudah keluar, tapi banyak warga setempat masih yakin ada yang disembunyikan. Kamu percaya yang mana?",
  },
  {
    id: "direct_vote",
    label: "Direct Vote",
    promptHint:
      "Tutup dengan format vote/polling sederhana di kolom komentar terkait teori mana yang audiens percaya.",
    exampleClosing:
      "Vote di kolom komentar: 1 kalau kamu percaya teori ilmiah, 2 kalau kamu percaya teori alternatif. Ayo seru.",
  },
];

// ============================================================
// HOROR
// ============================================================

const hororStrategies: ClosingStrategy[] = [
  {
    id: "jumpscare_tease",
    label: "Jumpscare Tease",
    promptHint:
      "Tutup dengan menggoda audiens bahwa ada satu detail paling menyeramkan yang belum diceritakan — biarkan imajinasi mereka yang menyelesaikan. Gunakan sudut pandang berbeda tiap generate, hindari frasa yang sama dengan sesi sebelumnya.",
    exampleClosing:
      "Tapi ada satu hal yang nggak berani gue ceritain di video ini. Kalau kamu penasaran... bayangkan sendiri dulu. Follow kalau berani lanjut.",
  },
  {
    id: "survivor_poll",
    label: "Survivor Poll",
    promptHint:
      "Tutup dengan menanyakan audiens apakah mereka akan bertahan atau kabur jika berada di situasi yang sama. Variasikan diksi: kadang pakai 'kamu', kadang 'kalau gue jadi kamu'.",
    exampleClosing:
      "Kalau kamu yang ada di posisi dia — bertahan atau kabur? Vote di kolom komentar, jujur aja.",
  },
  {
    id: "dare_challenge",
    label: "Dare Challenge",
    promptHint:
      "Tutup dengan menantang audiens untuk berani mencoba sesuatu yang berhubungan dengan cerita (misal: matiin lampu, dengerin suara tertentu). Gunakan gaya bahasa yang berbeda tiap generate.",
    exampleClosing:
      "Challenge: coba matiin lampu kamar kamu sekarang, terus dengerin 10 detik. Yang berani, komen 'aku berani'.",
  },
  {
    id: "urban_legend_link",
    label: "Urban Legend Link",
    promptHint:
      "Tutup dengan mengaitkan cerita ini ke urban legend lain yang masih berhubungan, sebagai undangan untuk video lanjutan. Variasikan cara menyebut kaitannya.",
    exampleClosing:
      "Dan ternyata, cerita ini nyambung ke urban legend lain yang lebih tua. Mau dengar sambungannya?",
  },
  {
    id: "fear_ranking",
    label: "Fear Ranking",
    promptHint:
      "Tutup dengan meminta audiens meranking momen paling menyeramkan dari video ini. Variasikan format: bisa 1-5, bisa sebut momen favorit.",
    exampleClosing:
      "Dari semua momen tadi, yang mana paling bikin merinding? Tulis nomornya di kolom komentar.",
  },
];

// ============================================================
// PSIKOLOGI
// ============================================================

const psikologiStrategies: ClosingStrategy[] = [
  {
    id: "self_reflect",
    label: "Self Reflect",
    promptHint:
      "Tutup dengan mengajak audiens merefleksikan diri mereka sendiri terhadap fenomena yang dibahas. Gunakan sudut pandang berbeda tiap generate, hindari frasa yang sama dengan sesi sebelumnya.",
    exampleClosing:
      "Sebelum nutup video ini, coba jujur sama diri sendiri: kamu termasuk tipe yang mana? Refleksi dulu, baru komen.",
  },
  {
    id: "behavior_challenge",
    label: "Behavior Challenge",
    promptHint:
      "Tutup dengan menantang audiens mencoba satu perilaku kecil yang berhubungan dengan insight psikologi tadi selama 24 jam. Variasikan cara menyampaikan tantangannya.",
    exampleClosing:
      "Challenge 24 jam: coba stop satu kebiasaan yang tadi kita bahas. Besok ceritain hasilnya di kolom komentar.",
  },
  {
    id: "share_experience",
    label: "Share Experience",
    promptHint:
      "Tutup dengan mengundang audiens berbagi pengalaman pribadi mereka yang relate dengan fenomena ini. Variasikan diksi ajakannya.",
    exampleClosing:
      "Pernah ngalamin hal yang sama? Ceritain di kolom komentar — siapa tahu pengalaman kamu bisa bantu orang lain.",
  },
  {
    id: "myth_bust",
    label: "Myth Bust",
    promptHint:
      "Tutup dengan menantang audiens menyebutkan mitos psikologi lain yang mereka percaya selama ini, untuk dibahas di video berikutnya. Variasikan cara meminta.",
    exampleClosing:
      "Masih percaya mitos psikologi lain yang selama ini kamu anggap bener? Sebutin di komen, nanti gue bahas.",
  },
  {
    id: "apply_test",
    label: "Apply Test",
    promptHint:
      "Tutup dengan mengajak audiens menguji insight psikologi ini dalam kehidupan sehari-hari mereka dan melaporkan hasilnya. Gunakan bahasa yang berbeda tiap generate.",
    exampleClosing:
      "Coba terapin insight tadi di minggu ini, terus balik ke sini buat cerita hasilnya. Dijamin kamu bakal kaget.",
  },
];

// ============================================================
// ROMANCE
// ============================================================

const romanceStrategies: ClosingStrategy[] = [
  {
    id: "relate_moment",
    label: "Relate Moment",
    promptHint:
      "Tutup dengan menanyakan momen mana yang paling relate dengan pengalaman cinta audiens. Variasikan diksi: kadang 'kamu', kadang 'kalian yang pernah ngerasain'.",
    exampleClosing:
      "Dari cerita tadi, momen mana yang paling relate sama pengalaman kamu? Ceritain di kolom komentar.",
  },
  {
    id: "audience_ship",
    label: "Audience Ship",
    promptHint:
      "Tutup dengan menanyakan audiens mendukung siapa dalam cerita (shipping). Variasikan cara menanyakan pasangan/karakter mana yang mereka dukung.",
    exampleClosing:
      "Kamu tim siapa di cerita ini? Dukung yang mana? Komen, kita hitung suaranya.",
  },
  {
    id: "personal_question",
    label: "Personal Question",
    promptHint:
      "Tutup dengan satu pertanyaan personal yang ringan dan relate ke tema cerita, mengundang audiens menjawab. Gunakan sudut pandang berbeda tiap generate.",
    exampleClosing:
      "Pertanyaan jujur: pernah nggak sih kamu nyesel karena nggak ngomong perasaanmu dulu?",
  },
  {
    id: "next_chapter_tease",
    label: "Next Chapter Tease",
    promptHint:
      "Tutup dengan menggoda ada kelanjutan cerita yang lebih emosional, sebagai undangan follow. Variasikan cara menggoda tanpa spoiler.",
    exampleClosing:
      "Tapi cerita ini belum selesai — ada babak kedua yang lebih mengharukan. Follow biar nggak ketinggalan.",
  },
  {
    id: "advice_request",
    label: "Advice Request",
    promptHint:
      "Tutup dengan meminta saran dari audiens untuk tokoh dalam cerita. Variasikan cara meminta saran.",
    exampleClosing:
      "Kalau kamu jadi tokohnya, apa saranmu? Tulis di kolom komentar — siapa tahu dia baca.",
  },
];

// ============================================================
// MOTIVASI
// ============================================================

const motivasiStrategies: ClosingStrategy[] = [
  {
    id: "action_commitment",
    label: "Action Commitment",
    promptHint:
      "Tutup dengan meminta audiens berkomitmen melakukan satu aksi kecil hari ini. Variasikan diksi: 'tulis di komen', 'komit di sini', 'janji di kolom komentar'.",
    exampleClosing:
      "Sekarang, tulis di kolom komentar: satu hal kecil yang akan kamu lakukan hari ini. Komitmen publik lebih kuat dari niat diam-diam.",
  },
  {
    id: "share_win",
    label: "Share Win",
    promptHint:
      "Tutup dengan mengundang audiens berbagi kemenangan kecil mereka minggu ini. Variasikan cara meminta.",
    exampleClosing:
      "Menang kecil minggu ini? Ceritain di kolom komentar — biar kita rayain bareng.",
  },
  {
    id: "challenge_accept",
    label: "Challenge Accept",
    promptHint:
      "Tutup dengan menantang audiens menerima tantangan 7 hari yang berhubungan dengan insight motivasi tadi. Gunakan bahasa yang berbeda tiap generate.",
    exampleClosing:
      "Tantangan 7 hari: mulai dari satu hal kecil tadi. Yang sanggup, komen 'aku sanggup'.",
  },
  {
    id: "quote_reflect",
    label: "Quote Reflect",
    promptHint:
      "Tutup dengan meminta audiens memilih satu kalimat dari video ini yang paling berkesan dan menuliskannya. Variasikan cara meminta.",
    exampleClosing:
      "Dari semua yang tadi, kalimat mana yang paling ngena di hati kamu? Tulis ulang di kolom komentar.",
  },
  {
    id: "community_invite",
    label: "Community Invite",
    promptHint:
      "Tutup dengan mengundang audiens bergabung dalam perjalanan perbaikan diri bersama, sebagai alasan follow. Variasikan cara mengundang.",
    exampleClosing:
      "Kalau kamu lagi dalam proses jadi versi terbaik dirimu, kita jalan bareng. Follow biar nggak sendirian.",
  },
];

// ============================================================
// EDUKASI
// ============================================================

const edukasiStrategies: ClosingStrategy[] = [
  {
    id: "curiosity_hook",
    label: "Curiosity Hook",
    promptHint:
      "Tutup dengan meninggalkan satu pertanyaan menarik yang belum terjawab, mengundang audiens mencari tahu atau menunggu video lanjutan. Variasikan cara menggantung rasa penasaran.",
    exampleClosing:
      "Tapi ada satu pertanyaan yang bahkan para ilmuwan masih bingung jawabannya. Penasaran? Follow buat lanjutannya.",
  },
  {
    id: "apply_now",
    label: "Apply Now",
    promptHint:
      "Tutup dengan mengajak audiens langsung mempraktikkan satu hal yang baru dipelajari. Variasikan diksi ajakannya.",
    exampleClosing:
      "Jangan cuma nonton — coba langsung praktikkan satu hal tadi sekarang. Hasilnya beda kalau kamu coba.",
  },
  {
    id: "quick_recap",
    label: "Quick Recap",
    promptHint:
      "Tutup dengan merangkum 3 poin kunci secara singkat, lalu minta audiens menyebutkan poin yang paling berguna. Variasikan format rekapnya.",
    exampleClosing:
      "Rekap singkat: satu, dua, tiga. Dari tiga poin tadi, mana yang paling berguna buat kamu? Komen nomornya.",
  },
  {
    id: "share_insight",
    label: "Share Insight",
    promptHint:
      "Tutup dengan mengundang audiens berbagi insight atau fakta tambahan yang mereka tahu tentang topik ini. Variasikan cara meminta.",
    exampleClosing:
      "Tahu fakta tambahan yang nggak gue sebutin? Share di kolom komentar — kita belajar bareng.",
  },
  {
    id: "challenge_viewer",
    label: "Challenge Viewer",
    promptHint:
      "Tutup dengan menantang audiens menguji pemahaman mereka dengan satu pertanyaan kuis singkat. Variasikan format kuisnya.",
    exampleClosing:
      "Kuis kilat: dari yang tadi dibahas, kira-kira jawaban yang bener apa? Tulis di komen, yang bener gue kasih shoutout.",
  },
];

// ============================================================
// AFFILIATE
// ============================================================

const affiliateStrategies: ClosingStrategy[] = [
  {
    id: "soft_cta",
    label: "Soft CTA",
    promptHint:
      "Tutup dengan ajakan halus (bukan hard-sell) untuk cek produk, tanpa tekanan. Variasikan diksi CTA: 'cek link di bio', 'intip di deskripsi', 'lihat harganya di link'.",
    exampleClosing:
      "Kalau penasaran sama produknya, cek aja link di bio — nggak ada kewajiban buat beli, lihat-lihat dulu aja.",
  },
  {
    id: "urgency",
    label: "Urgency",
    promptHint:
      "Tutup dengan menyebutkan keterbatasan waktu/stok secara wajar (tanpa fake urgency berlebihan). Variasikan cara menyampaikan.",
    exampleClosing:
      "Kabar baiknya, sekarang lagi ada promo terbatas. Tapi nggak tahu sampai kapan — kalau tertarik, mending cek sekarang.",
  },
  {
    id: "social_proof",
    label: "Social Proof",
    promptHint:
      "Tutup dengan menyebutkan bahwa banyak orang sudah membeli/mereview produk ini, mengundang audiens bergabung. Variasikan cara menyebut bukti sosial.",
    exampleClosing:
      "Udah ribuan orang yang review dan kebanyakan puas. Kamu mau jadi yang berikutnya? Link di bio.",
  },
  {
    id: "comparison_tease",
    label: "Comparison Tease",
    promptHint:
      "Tutup dengan menggoda ada perbandingan produk lain yang akan dibahas, sebagai undangan follow. Variasikan cara menggoda.",
    exampleClosing:
      "Tapi gimana kalau produk ini dibandingin sama kompetitornya? Itu bakal gue bahas di video berikutnya — follow ya.",
  },
  {
    id: "personal_recommendation",
    label: "Personal Recommendation",
    promptHint:
      "Tutup dengan rekomendasi personal yang jujur — untuk siapa produk ini cocok dan untuk siapa tidak. Variasikan cara menyampaikan.",
    exampleClosing:
      "Jujur, produk ini cocok buat kamu yang butuh X. Tapi kalau kebutuhanmu Y, mungkin kurang pas. Sesuai kebutuhan aja, link di bio.",
  },
];

// ============================================================
// SEJARAH
// ============================================================

const sejarahStrategies: ClosingStrategy[] = [
  {
    id: "what_if",
    label: "What If",
    promptHint:
      "Tutup dengan mengajak audiens membayangkan skenario 'bagaimana jika' sejarah berjalan berbeda. Variasikan skenario dan cara bertanya.",
    exampleClosing:
      "Bayangkan kalau peristiwa itu nggak terjadi — Indonesia bakal kayak gimana sekarang? Tulis skenariomu di kolom komentar.",
  },
  {
    id: "lesser_known_tease",
    label: "Lesser Known Tease",
    promptHint:
      "Tutup dengan menggoda ada fakta sejarah lain yang jarang diketahui dan masih berhubungan, sebagai undangan follow. Variasikan cara menggoda.",
    exampleClosing:
      "Masih ada satu fakta sejarah yang bahkan jarang dibahas di buku pelajaran. Penasaran? Follow buat lanjutannya.",
  },
  {
    id: "modern_parallel",
    label: "Modern Parallel",
    promptHint:
      "Tutup dengan mengajak audiens mencari persamaan antara peristiwa sejarah tadi dengan kondisi sekarang. Variasikan cara membandingkan.",
    exampleClosing:
      "Kalau kamu perhatian, pola yang sama masih kejadian sekarang. Kira-kira apa persamaannya? Komen.",
  },
  {
    id: "debate_invite",
    label: "Debate Invite",
    promptHint:
      "Tutup dengan mengundang audiens berdebat sehat tentang interpretasi sejarah yang masih diperdebatkan. Variasikan cara mengundang.",
    exampleClosing:
      "Interpretasi sejarah ini masih diperdebatkan sampai sekarang. Kamu tim mana? Ajak debat sehat di kolom komentar.",
  },
  {
    id: "era_poll",
    label: "Era Poll",
    promptHint:
      "Tutup dengan meminta audiens memilih era/zaman mana yang paling menarik untuk dibahas berikutnya. Variasikan format polling.",
    exampleClosing:
      "Era mana yang paling pengen kamu bahas berikutnya? Vote di kolom komentar: 1, 2, atau 3.",
  },
];

// ============================================================
// KEUANGAN
// ============================================================

const keuanganStrategies: ClosingStrategy[] = [
  {
    id: "action_step",
    label: "Action Step",
    promptHint:
      "Tutup dengan satu langkah praktis yang bisa langsung dilakukan audiens untuk keuangan mereka. Variasikan diksi langkahnya.",
    exampleClosing:
      "Langkah pertama yang bisa kamu lakukan hari ini: catat semua pengeluaran selama seminggu. Mulai dari sekarang.",
  },
  {
    id: "risk_reminder",
    label: "Risk Reminder",
    promptHint:
      "Tutup dengan mengingatkan risiko secara bijak tanpa menakut-nakuti, tetap dalam gaya edukatif. Variasikan cara menyampaikan disclaimer.",
    exampleClosing:
      "Ingat, semua keputusan keuangan punya risiko. Edukasi dulu, pahami risikonya, baru ambil keputusan. Ini bukan saran finansial ya.",
  },
  {
    id: "myth_bust",
    label: "Myth Bust",
    promptHint:
      "Tutup dengan menantang audiens menyebutkan mitos keuangan lain yang mereka percaya, untuk dibahas berikutnya. Variasikan cara meminta.",
    exampleClosing:
      "Masih percaya mitos keuangan lain yang selama ini kamu anggap bener? Sebutin di komen, nanti gue bahas.",
  },
  {
    id: "success_story",
    label: "Success Story",
    promptHint:
      "Tutup dengan mengundang audiens berbagi cerita sukses kecil dalam mengatur keuangan. Variasikan cara meminta cerita.",
    exampleClosing:
      "Punya cerita sukses kecil soal keuangan? Share di kolom komentar — bisa jadi inspirasi buat yang lain.",
  },
  {
    id: "community_question",
    label: "Community Question",
    promptHint:
      "Tutup dengan satu pertanyaan keuangan yang relate ke audiens, mengundang diskusi. Variasikan pertanyaannya.",
    exampleClosing:
      "Pertanyaan buat diskusi: kebiasaan finansial apa yang paling susah kamu ubah? Jujur di kolom komentar.",
  },
];

// ============================================================
// KUSTOM
// ============================================================

const kustomStrategies: ClosingStrategy[] = [
  {
    id: "open_question",
    label: "Open Question",
    promptHint:
      "Tutup dengan satu pertanyaan terbuka yang relevan dengan topik, mengundang audiens berpendapat. Variasikan diksi pertanyaannya.",
    exampleClosing:
      "Pertanyaan terbuka buat kamu: apa pendapatmu soal topik ini? Tulis bebas di kolom komentar.",
  },
  {
    id: "share_opinion",
    label: "Share Opinion",
    promptHint:
      "Tutup dengan mengundang audiens berbagi opini atau pengalaman mereka terkait topik. Variasikan cara meminta.",
    exampleClosing:
      "Punya opini atau pengalaman yang relate sama topik ini? Ceritain di kolom komentar.",
  },
  {
    id: "personal_story",
    label: "Personal Story",
    promptHint:
      "Tutup dengan mengundang audiens berbagi cerita pribadi yang berhubungan dengan topik. Variasikan cara mengundang.",
    exampleClosing:
      "Kalau kamu punya cerita pribadi yang nyambung sama topik ini, bagikan di kolom komentar — kita dengerin.",
  },
  {
    id: "next_topic_vote",
    label: "Next Topic Vote",
    promptHint:
      "Tutup dengan meminta audiens memilih topik berikutnya yang ingin dibahas. Variasikan format voting.",
    exampleClosing:
      "Topik apa yang pengen gue bahas berikutnya? Vote di kolom komentar, topik paling banyak suara bakal gue buat.",
  },
  {
    id: "challenge_viewer",
    label: "Challenge Viewer",
    promptHint:
      "Tutup dengan menantang audiens mencoba atau mempraktikkan sesuatu yang berhubungan dengan topik. Variasikan cara menantang.",
    exampleClosing:
      "Challenge: coba praktikkan satu hal dari video ini dalam 24 jam. Yang udah coba, ceritain hasilnya di komen.",
  },
];

// ============================================================
// REGISTRY TERPUSAT
// ============================================================

export const closingStrategiesByCategory: Record<string, ClosingStrategy[]> = {
  misteri: misteriStrategies,
  horor: hororStrategies,
  psikologi: psikologiStrategies,
  romance: romanceStrategies,
  motivasi: motivasiStrategies,
  edukasi: edukasiStrategies,
  affiliate: affiliateStrategies,
  sejarah: sejarahStrategies,
  keuangan: keuanganStrategies,
  custom: kustomStrategies,
};

/**
 * Pilih strategi closing secara random dari yang BELUM dipakai (anti-repeat).
 * Jika semua sudah terpakai, fallback ke random dari semua strategi kategori.
 *
 * @param categoryId - ID kategori (horor, misteri, psikologi, dll)
 * @param usedIds - Array id strategi yang sudah pernah dipakai
 * @returns ClosingStrategy terpilih
 */
export function getClosingStrategy(categoryId: string, usedIds: string[] = []): ClosingStrategy {
  const pool = closingStrategiesByCategory[categoryId] || closingStrategiesByCategory["custom"] || [];
  const usedSet = new Set(usedIds);
  const unused = pool.filter((s) => !usedSet.has(s.id));

  // Prioritaskan yang belum dipakai; fallback ke semua jika sudah habis
  const available = unused.length > 0 ? unused : pool;
  return available[Math.floor(Math.random() * available.length)];
}