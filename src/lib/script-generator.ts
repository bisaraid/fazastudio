/**
 * AC Script Generator — Engine Prompt Berbasis Kategori (ViraLoop-Style)
 *
 * Mengadopsi kualitas prompt viraloop (multi-segment parallel, anti-repeat,
 * clamping modes, narratorPersona, scriptSkeleton) tanpa merubah viraloop.
 * UI tetap milik ACS.
 */

import { aiCompletion } from "@/lib/ai/completion";
import { generateId } from "@/lib/utils";
import {
  CategoryConfig,
  CategoryId,
  HookPatternType,
  ScriptSkeleton,
} from "@/lib/categories/types";
import { getCategoryConfig, getCustomCategoryConfig } from "@/lib/categories";
import { getCategoryConfig as getAutoCategoryConfig } from "@/lib/categories/config";
import { getDurationConfigForCategory, DurationTier } from "@/lib/duration";
import { Platform } from "@/lib/types";
import {
  parseScriptJson,
  validateScriptScenes,
  validateContentRules,
  validateClosingScene,
  validateAffiliateFactuality,
  validateAffiliateComparison,
  validationFailureCounters,
  ValidatableScene,
  AffiliateInput,
  AffiliateMode,
} from "@/lib/script-validator";
import { detectHookType } from "@/lib/pattern";
import { getTopHooks } from "@/lib/dynamicHooks";
import { getClosingStrategy, ClosingStrategy } from "@/lib/categories/closing-strategies";
import { generateSeed } from "@/lib/seed";
import { fetchTrendingProducts, Product } from "@/lib/trendtracker-client";
import { buildComparisonPrompt, buildTrendingContext } from "@/lib/affiliate-mode";
import {
  getUsedHookPatternValues,
  selectHookWithAntiRepeat,
  recordUsage,
} from "@/lib/usage-history";

// ============================================================
// TYPES
// ============================================================

export interface GenerateScriptInput {
  topic: string;
  categoryId: CategoryId;
  customGenre?: string;
  duration: DurationTier;
  /** Durasi target dalam detik (untuk estimasi) */
  targetDuration?: number;
  /** Platform tujuan (TikTok/YouTube/dll) — menyesuaikan gaya & kepadatan narasi */
  platform?: Platform;
  affiliateInput?: AffiliateInput;
  affiliateMode?: AffiliateMode;
  identityKey?: string;
}

export interface GeneratedScene {
  id: string;
  order: number;
  heading: string;
  content: string;
  narration?: string;
  sceneMood?: string;
  scene_mood?: string;
  imagePrompt?: string;
  image_prompt?: string;
  visualPrompt?: string;
  duration: number;
  isHook?: boolean;
  is_hook?: boolean;
  isConclusion?: boolean;
  is_conclusion?: boolean;
  flagged?: boolean;
}

export interface GenerateScriptResult {
  id: string;
  title: string;
  scenes: GeneratedScene[];
  fullScript: string;
  estimatedDuration: number;
  wordCount: number;
  hookPatternUsed?: string;
  failedSegment?: number;
}

export interface GenerateScriptProgress {
  status: "generating_outline" | "generating_segments" | "validating" | "done" | "error";
  currentSegment?: number;
  totalSegments?: number;
  message?: string;
  error?: string;
}

interface HookEntry {
  text: string;
  patternValue: HookPatternType;
}

// ============================================================
// CONSTANTS
// ============================================================

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// ============================================================
// HELPERS
// ============================================================

function getScriptSkeleton(config: { scriptSkeleton?: ScriptSkeleton; usesFictionalCharacter?: boolean }): ScriptSkeleton {
  if (config.scriptSkeleton) return config.scriptSkeleton;
  return config.usesFictionalCharacter ? "narrative_arc" : "informational_arc";
}

function resolveConfig(categoryId: CategoryId, config?: CategoryConfig): CategoryConfig {
  if (config) return config;
  return getCategoryConfig(categoryId);
}

// ============================================================
// PROMPT BUILDERS
// ============================================================

/** Estimasi jumlah scene agar pas dengan durasi target (detik).
 *  Video pendek → sedikit scene singkat; video panjang → lebih banyak scene.
 *  Asumsi ~4-6 detik narasi per scene untuk konten singkat. */
function scenesForDuration(seconds: number): number {
  const s = seconds || 60;
  if (s <= 30) return 3;
  if (s <= 60) return 5;
  if (s <= 120) return 8;
  if (s <= 240) return 12;
  if (s <= 480) return 18;
  return 24;
}

/** Estimasi target jumlah kata narasi agar video sesuai durasi (detik).
 *  Asumsi kecepatan bicara normal ~2.4 kata/detik (~150 wpm). */
function estimateWordsForDuration(seconds: number): number {
  const words = Math.round((seconds || 60) * 2.4);
  return Math.max(20, words);
}

/** Potong narasi setiap scene agar total kata tidak melebihi target.
 *  Mengembalikan salinan baru, narasi asli tidak diubah.
 *  Strategi: alokasikan budget kata per scene secara proporsional, lalu
 *  potong tiap scene dari akhir kalimat agar tidak kasar di tengah kalimat. */
function enforceWordBudget(
  scenes: GeneratedScene[],
  targetWords: number
): GeneratedScene[] {
  if (scenes.length === 0) return scenes;

  // Hitung total kata saat ini
  const totalWords = scenes.reduce(
    (sum, s) => sum + (s.content || s.narration || "").split(/\s+/).filter(Boolean).length,
    0
  );
  if (totalWords <= targetWords) return scenes;

  const ratio = targetWords / totalWords;
  const raw = scenes.map((s) => {
    const words = (s.content || s.narration || "")
      .split(/\s+/)
      .filter(Boolean);
    const budget = Math.max(1, Math.round(words.length * ratio));
    const trimmed = words.slice(0, budget).join(" ");
    return { ...s, content: trimmed, narration: trimmed };
  });

  // Koreksi: pastikan total setelah potong tidak melebihi target (budget sisa)
  let over = raw
    .reduce((sum, s) => sum + (s.content || "").split(/\s+/).filter(Boolean).length, 0) -
    targetWords;
  if (over > 0) {
    // Potong dari scene terakhir ke depan
    for (let i = raw.length - 1; i >= 0 && over > 0; i--) {
      const w = (raw[i].content || "").split(/\s+/).filter(Boolean);
      const keep = Math.max(1, w.length - over);
      const trimmed = w.slice(0, keep).join(" ");
      over -= (w.length - keep);
      raw[i] = { ...raw[i], content: trimmed, narration: trimmed };
    }
  }

  return raw;
}

/** Petunjuk durasi + platform untuk dimasukkan ke prompt segment. */
function buildDurationGuidance(
  targetDuration?: number,
  platform?: Platform
): string {
  const sec = targetDuration && targetDuration > 0 ? targetDuration : undefined;
  if (sec) {
    const words = estimateWordsForDuration(sec);
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    const label = mins > 0 ? `${mins} menit${secs > 0 ? ` ${secs} detik` : ""}` : `${secs} detik`;
    return `Durasi TARGET: ${label} (~${words} kata total narasi untuk seluruh video).
SESUAIKAN panjang narasi TOTAL agar pas dengan target durasi tersebut. Video pendek (≤60 detik) harus PADAT dan ringkas — kurang dari 150 kata; video panjang boleh lebih detail.`;
  }
  // Fallback ke platform (jika detik tidak ada)
  if (platform) {
    const pl = platform === "tiktok" || platform === "reels" ? "pendek dan sangat padat (TikTok/Reels)" :
      platform === "youtube" ? "berdurasi lebih panjang dan detail (YouTube)" :
      platform === "podcast" ? "berdurasi panjang, gaya podcast, detail" : "";
    if (pl) return `Platform: ${platform} → kebutuhannya ${pl}. Sesuaikan panjang narasi (TikTok/Reels padat, YouTube/podcast lebih panjang).\n`;
  }
  return "";
}

function buildSegmentPrompt(
  categoryId: CategoryId,
  topic: string,
  duration: DurationTier,
  segmentIndex: number,
  totalSegments: number,
  globalOutline: string,
  previousSummary: string,
  affiliateInput?: AffiliateInput,
  explicitConfig?: CategoryConfig,
  targetDuration?: number,
  platform?: Platform
): string {
  const config = resolveConfig(categoryId, explicitConfig);
  const skeleton = getScriptSkeleton(config);
  const durConfig = getDurationConfigForCategory(categoryId, duration);
  // Jumlah scene efektif mengikuti durasi target bila tersedia (video pendek → lebih sedikit scene).
  const targetSceneTotal = targetDuration && targetDuration > 0
    ? Math.min(durConfig.targetScenes, scenesForDuration(targetDuration))
    : durConfig.targetScenes;
  const scenesPerSegment = Math.ceil(targetSceneTotal / totalSegments);

  // Affiliate product block
  let affiliateProductBlock = "";
  if (
    (categoryId === "affiliate" || categoryId === "custom") &&
    affiliateInput &&
    affiliateInput.productName
  ) {
    affiliateProductBlock = `
DATA PRODUK (WAJIB gunakan data ini, JANGAN mengarang):
Nama Produk: ${affiliateInput.productName}
Fitur/Deskripsi Utama: ${affiliateInput.productDescription}
${affiliateInput.productPrice ? `Harga: Rp ${affiliateInput.productPrice}` : ""}
${affiliateInput.productRating ? `Rating: ${affiliateInput.productRating}/5` : ""}

ATURAN KETAT — HANYA gunakan fitur/klaim yang SECARA EKSPLISIT tertulis di 'Fitur/Deskripsi Utama' berikut. DILARANG KERAS menambahkan:
(a) angka/persentase yang tidak ada di input (misal 'terbukti 95% efektif'),
(b) klaim sertifikasi/BPOM/halal/ISO kecuali eksplisit disebut user,
(c) superlatif tak terverifikasi ('nomor 1 di Indonesia', 'terlaris'),
(d) perbandingan dengan brand kompetitor spesifik yang tidak diminta.
Jika deskripsi input terbatas/singkat, buat script yang singkat dan jujur sesuai info yang ada — JANGAN mengarang detail tambahan untuk membuat script terasa lebih lengkap.`;
  }

  if (segmentIndex === 0) {
    const categoryLabel = categoryId === "affiliate" ? "review produk" : categoryId;
    return `Buat script video ${categoryLabel} dengan topik: "${topic}"
    
OUTLINE GLOBAL:
${globalOutline}

Target: ${scenesPerSegment} scene pertama (total ${targetSceneTotal} scene untuk seluruh video).
Durasi: ${durConfig.label}.
${buildDurationGuidance(targetDuration, platform)}

${affiliateProductBlock}
Buat scene-scene pertama sesuai outline di atas. Scene pertama (is_hook: true) harus hook yang kuat.`;
  }

  // Subsequent segments
  const startScene = segmentIndex * scenesPerSegment + 1;
  const endScene = Math.min((segmentIndex + 1) * scenesPerSegment, targetSceneTotal);

  if (skeleton === "informational_arc") {
    return `Lanjutkan script dengan topik: "${topic}"

OUTLINE GLOBAL:
${globalOutline}

${previousSummary ? `POIN SEBELUMNYA YANG SUDAH DIBAHAS (untuk menghindari pengulangan):\n${previousSummary}\n` : ""}

Target: ${scenesPerSegment} scene berikutnya (scene ${startScene} sampai ${endScene}).

Lanjutkan ke poin/langkah berikutnya dari outline di atas. Penting:
- Setiap segmen membahas poin BARU yang berdiri sendiri — JANGAN buat cliffhanger atau alur bersambung dramatis
- JANGAN menggunakan kata "Lanjutkan cerita" — ini BUKAN cerita, ini konten informatif
- JANGAN membuat karakter/tokoh fiksi — sampaikan langsung ke pemirsa (kamu/guys)
- Gunakan outline global sebagai panduan poin-poin yang harus dibahas
- Jangan ulangi poin yang sudah tercakup di ringkasan sebelumnya

${affiliateProductBlock}`;
  }

  const continuityInstruction =
    skeleton === "factual_narrative"
      ? `Lanjutkan kronologi faktual dari outline di atas. Pastikan:
- Kronologi waktu akurat dan berurutan
- Tokoh/entitas KONSISTEN dengan fakta yang sudah disampaikan
- Jangan membuat karakter fiksi baru
- Alur faktual dan kronologis, jangan membuat twist dramatis yang tidak berdasarkan fakta`
      : `Lanjutkan cerita dari outline global di atas. Pastikan:
- Karakter/tokoh KONSISTEN dengan outline
- Nama tokoh dan setting KONSISTEN
- Alur cerita nyambung logis mengikuti outline
- Mood sesuai dengan perkembangan cerita
- Jangan ulangi adegan yang sudah terjadi`;

  return `Lanjutkan script dengan topik: "${topic}"

OUTLINE GLOBAL:
${globalOutline}

${previousSummary ? `RINGKASAN BAGIAN SEBELUMNYA (untuk referensi kontinuitas):\n${previousSummary}\n` : ""}

Target: ${scenesPerSegment} scene berikutnya (scene ${startScene} sampai ${endScene}).

${continuityInstruction}

PENTING: Gunakan outline global sebagai panduan utama. Ringkasan sebelumnya hanya untuk referensi kontinuitas.

${affiliateProductBlock}`;
}

function buildSystemPrompt(
  categoryId: CategoryId,
  staticHookEntries: HookEntry[],
  dynamicHookEntries: HookEntry[],
  usedPatternValues: Set<string>,
  explicitConfig?: CategoryConfig,
  usedClosingIds: string[] = []
): { prompt: string; selectedText: string | null; selectedPatternValue: HookPatternType | null; selectedClosingStrategy: ClosingStrategy | null } {
  const config = resolveConfig(categoryId, explicitConfig);
  const skeleton = getScriptSkeleton(config);
  const persona = config.narratorPersona;
  const autoConfig = getAutoCategoryConfig(categoryId);
  let selectedClosingStrategy: ClosingStrategy | null = null;

  let prompt = `Kamu adalah penulis script video pendek bahasa Indonesia.

PERSONA NARATOR:
Nama persona: ${persona.name}
Tone: ${persona.tone}
Irama kalimat: ${persona.sentenceRhythm}
Frasa khas yang boleh dipakai: ${persona.signaturePhrases.join(", ")}
Kata yang HARUS DIHINDARI: ${persona.avoidWords.join(", ")}

AUTO-CONFIG KATEGORI:
Tone: ${autoConfig.script.tone}
Pacing: ${autoConfig.script.pacing}
Bahasa: ${autoConfig.script.language}
Hook style: ${autoConfig.hook}

STRUKTUR KONTEN:
${config.storyStructure}

${config.rules ? `ATURAN:\n${config.rules}\n` : ""}`;

  if (config.closingMode === "actionable_takeaway") {
    prompt += `
CLOSING WAJIB: Scene TERAKHIR dari naskah HARUS berisi SATU poin kesimpulan konkret yang bisa langsung dipraktikkan penonton. Bukan "jadi begitulah" — tapi ajakan spesifik seperti "coba lakukan X" atau "pilihan yang bisa kamu ambil adalah Y". Sampaikan tetap dalam gaya persona narator.`;
  } else if (config.closingMode === "cliffhanger_follow") {
    prompt += `
CLOSING WAJIB: Scene TERAKHIR dari naskah HARUS meninggalkan elemen emosional yang BELUM TERSELESAIKAN — pertanyaan menggantung, ketegangan yang belum reda, atau momen yang bikin penonton penasaran. Sertakan ajakan IMPLISIT untuk follow (misalnya "ikutin cerita selanjutnya" atau "follow biar nggak ketinggalan") tanpa terdengar seperti iklan murahan.`;
  } else if (config.closingMode === "open_case_factual") {
    prompt += `
CLOSING WAJIB: Scene TERAKHIR dari naskah adalah penutup OPEN-ENDED yang mendorong engagement audiens — BUKAN kesimpulan mutlak, BUKAN cliffhanger fiksi.
`;

    // Semua kategori: gunakan closing engagement strategy dengan anti-repeat
    selectedClosingStrategy = getClosingStrategy(categoryId, usedClosingIds);
    prompt += `
STRATEGI CLOSING UNTUK VIDEO INI:
${selectedClosingStrategy.promptHint}

CONTOH KASAR (hanya sebagai inspirasi, BUKAN template yang harus ditiru persis):
${selectedClosingStrategy.exampleClosing}

INSTRUKSI:
- Rumuskan closing dengan kalimat ORIGINAL milikmu sendiri berdasarkan strategi di atas dan konten spesifik video ini.
- JANGAN memakai kalimat template generik, JANGAN mengulang strategi yang sama dengan video sebelumnya.
- Closing harus natural dan kontekstual dengan kasus/fenomena yang dibahas, bukan tempelan.
`;

    prompt += `
ATURAN ANTI-KASUS-USANG:
- JANGAN sajikan kasus ini sebagai misteri jika sebenarnya sudah ada penjelasan resmi/terbukti/terbantahkan.
- Jika ragu status terkini suatu kasus, fokus ke aspek yang memang masih diperdebatkan, jangan mengarang status "belum terpecahkan" untuk kasus yang sudah selesai.`;
  }

  if (skeleton === "narrative_arc") {
    prompt += `
Kategori ini MENGGUNAKAN alur CERITA FIKSI dengan karakter/tokoh. Wajib membuat tokoh dengan nama dan latar yang jelas untuk mendukung cerita. Bangun ketegangan dramatis, konflik, dan resolusi sebagaimana alur cerita pada umumnya.
`;
  } else if (skeleton === "factual_narrative") {
    prompt += `
ATURAN WAJIB: Kategori ini adalah konten FAKTUAL berbasis kronologi kejadian/fenomena nyata. BOLEH menyebut tokoh SEJARAH ASLI atau pihak-pihak nyata yang terkait. DILARANG KERAS mengarang KARAKTER FIKSI BARU. DILARANG membuat subplot/cerita personal fiktif. Sampaikan konten berdasarkan fakta secara kronologis.
`;
  } else if (skeleton === "informational_arc") {
    prompt += `
ATURAN WAJIB: Kategori ini adalah konten INFORMATIF/TIPS LANGSUNG, BUKAN cerita fiksi. DILARANG KERAS membuat nama karakter (seperti 'Rina', 'Budi', dst), DILARANG membuat subplot/cerita personal apapun. Sampaikan SEMUA poin secara langsung ke pemirsa menggunakan kata 'kamu' atau 'guys', TANPA tokoh perantara. Setiap segmen berdiri sendiri membahas poin baru — JANGAN membuat cliffhanger atau alur bersambung dramatis.
`;
  }

  prompt += `
MOOD VALID (hanya gunakan mood dari daftar ini):
${config.validMoods.join(", ")}

FORMAT OUTPUT (WAJIB JSON):
{
  "scenes": [
    {
      "content": "teks narasi bahasa Indonesia",
      "heading": "judul singkat scene",
      "sceneMood": "salah satu mood valid di atas",
      "visualPrompt": "bahasa Inggris: [subjek+aksi], [ekspresi], [setting], [gaya visual]${config.styleSuffix || ""}",
      "duration": 30
    }
  ]
}

PENTING:
- Setiap scene harus punya sceneMood yang valid dari daftar di atas
- Scene pertama (is_hook: true) harus hook yang kuat
- visualPrompt dalam bahasa Inggris, 15-25 kata
- Narasi dalam bahasa Indonesia yang natural`;

  if (config.exampleScenes && config.exampleScenes.length > 0) {
    prompt += `\n\nCONTOH REFERENSI (multiple styles — ikuti gaya masing-masing, JANGAN gabung semua gaya menjadi satu pola):`;
    config.exampleScenes.forEach((ex, i) => {
      prompt += `\n\nContoh ${i + 1}:
Narasi: ${ex.narration}
Mood: ${ex.scene_mood}`;
      if (ex.image_prompt) {
        prompt += `\nImage prompt: ${ex.image_prompt}`;
      }
    });
  }

  prompt += `\n\nATURAN PENTING UNTUK VARIASI:
Contoh di atas hanya referensi gaya dan struktur, BUKAN template yang harus ditiru persis. 
Buat hook dan kalimat dengan struktur kalimat/kata pembuka yang BERBEDA dari semua contoh di atas. 
Hindari pengulangan pola pembuka yang sama setiap generate.`;

  // Session seed — variasi diksi per generate (hanya runtime, tidak ke DB)
  const sessionSeed = generateSeed();
  prompt += `\n\nATURAN VARIASI DIKSI:
Variasikan diksi dan struktur kalimat. Session seed: ${sessionSeed} — gunakan sebagai inspirasi tone, bukan ditulis literal.`;

  // Hook selection
  const hookPool: HookEntry[] = [...staticHookEntries, ...dynamicHookEntries];
  let selectedText: string | null = null;
  let selectedPatternValue: HookPatternType | null = null;

  if (hookPool.length > 0) {
    const selected = selectHookWithAntiRepeat(hookPool, usedPatternValues);
    selectedText = selected.text;
    selectedPatternValue = selected.patternValue;
    prompt += `\n\nHOOK ANGLE UNTUK GENERATE INI: ${selectedText}`;

    if (dynamicHookEntries.length > 0) {
      const dynamicTexts = dynamicHookEntries.map(h => h.text);
      prompt += `\n\nDATA POLA HOOK TERBUKTI (dari analisis ribuan video ${categoryId}):
${dynamicTexts.join("\n")}

Gunakan insight di atas sebagai referensi gaya hook yang TERBUKTI performa. 
Namun tetap variasikan bahasa dan pendekatan agar tidak terdengar repetitif.`;
    }
  }

  return { prompt, selectedText, selectedPatternValue, selectedClosingStrategy };
}

// ============================================================
// GENERATION
// ============================================================

function generateSegmentSummary(scenes: ValidatableScene[], segmentIndex: number): string {
  const narrations = scenes.map(s => (s.narration || s.content || "")).join(" ");
  const words = narrations.split(/\s+/).filter(w => w.length > 0);
  const truncated = words.slice(0, 100).join(" ");
  const moods = Array.from(new Set(scenes.map(s => s.scene_mood || s.sceneMood || "")));
  const hooks = scenes.filter(s => s.is_hook).length;

  return `[Segmen ${segmentIndex + 1}]: ${truncated}... [Mood: ${moods.join(", ")}] [Hook scenes: ${hooks}]`;
}

async function generateSegment(
  categoryId: CategoryId,
  topic: string,
  duration: DurationTier,
  segmentIndex: number,
  totalSegments: number,
  globalOutline: string,
  previousSummary: string,
  affiliateInput?: AffiliateInput,
  retryCount: number = 0,
  signal?: AbortSignal,
  staticHookEntries: HookEntry[] = [],
  dynamicHookEntries: HookEntry[] = [],
  usedPatternValues: Set<string> = new Set(),
  explicitConfig?: CategoryConfig,
  usedClosingIds: string[] = [],
  targetDuration?: number,
  platform?: Platform
): Promise<{ scenes: ValidatableScene[]; summary: string; selectedPatternValue?: string | null; selectedClosingStrategy?: ClosingStrategy | null }> {
  const { prompt: systemPrompt, selectedPatternValue, selectedClosingStrategy } = buildSystemPrompt(
    categoryId, staticHookEntries, dynamicHookEntries, usedPatternValues, explicitConfig, usedClosingIds
  );

  const userPrompt = buildSegmentPrompt(
    categoryId, topic, duration, segmentIndex, totalSegments,
    globalOutline, previousSummary, affiliateInput, explicitConfig, targetDuration, platform
  );

  try {
    const result = await aiCompletion({
      model: MODEL!,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2048,
      response_format: { type: "json_object" },
      temperature: (explicitConfig || getCategoryConfig(categoryId)).temperature ?? 0.7,
      signal,
    });

    const parsed = parseScriptJson(result.content);
    if (!parsed || !parsed.scenes || parsed.scenes.length === 0) {
      throw new Error("Gagal parse JSON dari response AI");
    }

    const rawScenes = parsed.scenes as Array<{
      narration?: string;
      content?: string;
      heading?: string;
      scene_mood?: string;
      sceneMood?: string;
      image_prompt?: string;
      visualPrompt?: string;
      is_hook?: boolean;
      is_conclusion?: boolean;
    }>;

    // Validate moods
    const validatedScenes = validateScriptScenes(rawScenes as ValidatableScene[], explicitConfig || getCategoryConfig(categoryId));

    // Content validation
    const contentValidation = validateContentRules(validatedScenes, categoryId);
    if (!contentValidation.valid) {
      validationFailureCounters[categoryId] = (validationFailureCounters[categoryId] || 0) + 1;
      console.warn(`[Validation] Segment ${segmentIndex + 1} content validation failed for ${categoryId}:`, contentValidation.flaggedSceneIndices);

      if (retryCount < 1) {
        const delay = 1000 * Math.pow(2, retryCount);
        console.warn(`Segment ${segmentIndex + 1} content invalid, retry ${retryCount + 1}/1 dalam ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return generateSegment(
          categoryId, topic, duration, segmentIndex, totalSegments,
          globalOutline, previousSummary, affiliateInput, retryCount + 1, signal,
          staticHookEntries, dynamicHookEntries, usedPatternValues, explicitConfig, usedClosingIds, targetDuration, platform
        );
      }

      const flaggedScenes = validatedScenes.map((scene, idx) => ({
        ...scene,
        flagged: contentValidation.flaggedSceneIndices.includes(idx),
      }));
      const summary = generateSegmentSummary(flaggedScenes, segmentIndex);
      return { scenes: flaggedScenes, summary, selectedPatternValue, selectedClosingStrategy };
    }

    const summary = generateSegmentSummary(validatedScenes, segmentIndex);
    return { scenes: validatedScenes, summary, selectedPatternValue, selectedClosingStrategy };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    if (retryCount < 2) {
      const delay = 1000 * Math.pow(2, retryCount);
      console.warn(`Segment ${segmentIndex + 1} gagal, retry ${retryCount + 1}/2 dalam ${delay}ms:`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateSegment(
        categoryId, topic, duration, segmentIndex, totalSegments,
        globalOutline, previousSummary, affiliateInput, retryCount + 1, signal,
        staticHookEntries, dynamicHookEntries, usedPatternValues, explicitConfig, usedClosingIds, targetDuration, platform
      );
    }
    throw error;
  }
}

async function generateOutline(
  categoryId: CategoryId,
  topic: string,
  affiliateInput?: AffiliateInput,
  signal?: AbortSignal,
  explicitConfig?: CategoryConfig
): Promise<string> {
  const config = resolveConfig(categoryId, explicitConfig);
  const skeleton = getScriptSkeleton(config);

  let prompt: string;

  if (skeleton === "informational_arc") {
    prompt = `Buat outline 3-5 poin untuk konten ${categoryId === "affiliate" ? "review produk" : categoryId} dengan topik: "${topic}"

${categoryId === "affiliate" && affiliateInput?.productName ? `
DATA PRODUK:
Nama: ${affiliateInput.productName}
Deskripsi: ${affiliateInput.productDescription}
${affiliateInput.productPrice ? `Harga: Rp ${affiliateInput.productPrice}` : ""}
` : ""}

Outline harus mencakup:
- Poin-poin utama yang akan dibahas
- Urutan penyampaian yang logis dari yang paling penting ke pendukung
- Satu takeaway kunci yang harus didapat penonton

Format: teks biasa, 3-5 poin saja. Setiap poin dalam 1 kalimat jelas.`;
  } else if (skeleton === "factual_narrative") {
    prompt = `Buat outline 3-5 kalimat untuk konten ${config.name} dengan topik: "${topic}"

Outline harus mencakup:
- Peristiwa/tokoh nyata yang akan dibahas
- Kronologi waktu yang akurat (tahun, periode)
- Dampak peristiwa tersebut ke masa kini
- Mood dominan

Format: teks biasa, 3-5 kalimat saja. Kronologis berdasarkan fakta.`;
  } else {
    prompt = `Buat outline 3-5 kalimat untuk cerita ${categoryId} dengan topik: "${topic}"

Outline harus mencakup:
- Tokoh utama (jika ada)
- Setting/latar
- Alur dari awal sampai akhir (termasuk twist jika ada)
- Mood dominan

Format: teks biasa, 3-5 kalimat saja.`;
  }

  const systemContent =
    skeleton === "informational_arc"
      ? `Kamu adalah penulis script ${config.name} Indonesia. Buat outline berupa poin-poin informatif.`
      : `Kamu adalah penulis script ${config.name} Indonesia. Buat outline singkat.`;

  const result = await aiCompletion({
    model: MODEL!,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: prompt },
    ],
    response_format: { type: "text" },
    temperature: config.temperature ?? 0.7,
    signal,
  });

  return result.content.trim();
}

// ============================================================
// MAIN FUNCTION
// ============================================================

export async function generateScriptWithAI(
  input: GenerateScriptInput,
  onProgress?: (progress: GenerateScriptProgress) => void,
  signal?: AbortSignal
): Promise<GenerateScriptResult> {
  const { topic, categoryId, customGenre, duration, affiliateInput, affiliateMode, identityKey, targetDuration, platform } = input;

  try {
    // Resolve config
    const config =
      categoryId === "custom" && customGenre
        ? getCustomCategoryConfig(customGenre)
        : getCategoryConfig(categoryId);

    const explicitConfig: CategoryConfig | undefined =
      categoryId === "custom" && customGenre ? config : undefined;

    // Deteksi affiliate mode (default single)
    const isComparison = affiliateMode === "comparison" || affiliateInput?.affiliateMode === "comparison";

    // Comparison mode: override duration ke 'long' (jika bukan)
    const effectiveDuration: DurationTier = isComparison ? "long" : duration;

    const durConfig = getDurationConfigForCategory(categoryId, effectiveDuration);

    // Jumlah scene & segmen disesuaikan dengan durasi target (detik) jika ada.
    // Ini mencegah video pendek (mis. 30s) memaksa 15+ scene → narasi panjang.
    const effectiveScenes = targetDuration && targetDuration > 0
      ? Math.min(durConfig.targetScenes, scenesForDuration(targetDuration))
      : durConfig.targetScenes;
    const effectiveSegments = targetDuration && targetDuration > 0
      ? Math.max(1, Math.min(durConfig.segments, Math.ceil(effectiveScenes / 3)))
      : durConfig.segments;
    const totalSegments = effectiveSegments;

    // Fetch data trending dari TrendTracker (untuk single mode — konteks, bukan hard-sell)
    let trendingProducts: Product[] = [];
    if (categoryId === "affiliate" && !isComparison) {
      try {
        trendingProducts = await fetchTrendingProducts();
        console.log(`[TrendTracker] Got ${trendingProducts.length} trending products for affiliate single mode`);
      } catch (e) {
        console.warn("[TrendTracker] Gagal fetch trending (single mode tetap jalan):", e);
        trendingProducts = [];
      }
    }
    const trendingContext = buildTrendingContext(trendingProducts);

    // Dynamic hooks
    const dynamicHooks = await getTopHooks(categoryId);

    const staticHookEntries: HookEntry[] = (config.hookAngles ?? []).map(text => ({
      text,
      patternValue: detectHookType(text),
    }));

    const dynamicHookEntries: HookEntry[] = dynamicHooks.map(h => ({
      text: h.angle,
      patternValue: h.patternValue as HookPatternType,
    }));

    // Anti-repeat
    const usedPatternValues: Set<string> = identityKey
      ? await getUsedHookPatternValues(identityKey, categoryId)
      : new Set<string>();

    // Anti-repeat untuk closing strategy misteri (scope terpisah dari hook)
    const usedClosingIds: string[] = [];

    // Step 1: Outline
    onProgress?.({ status: "generating_outline", message: "Membuat outline..." });
    const globalOutline = await generateOutline(categoryId, topic, affiliateInput, signal, explicitConfig);

    // Step 2: Segments
    const allScenes: ValidatableScene[] = [];

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    let hookPatternUsed: string | undefined;

    onProgress?.({
      status: "generating_segments",
      currentSegment: 1,
      totalSegments,
      message: `Membuat bagian 1 dari ${totalSegments}...`,
    });

    let segment1: { scenes: ValidatableScene[]; summary: string; selectedPatternValue?: string | null; selectedClosingStrategy?: ClosingStrategy | null };
    try {
      segment1 = await generateSegment(
        categoryId, topic, effectiveDuration, 0, totalSegments,
        globalOutline, "", affiliateInput, 0, signal,
        staticHookEntries, dynamicHookEntries, usedPatternValues, explicitConfig, usedClosingIds,
        targetDuration, platform
      );
      allScenes.push(...segment1.scenes);
      hookPatternUsed = segment1.selectedPatternValue || undefined;
      // Track closing strategy yang sudah dipakai (anti-repeat)
      if (segment1.selectedClosingStrategy) {
        usedClosingIds.push(segment1.selectedClosingStrategy.id);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      onProgress?.({
        status: "error",
        message: `Gagal di bagian 1 dari ${totalSegments}`,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }

    // Generate segments 2+ in parallel
    if (totalSegments > 1) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      onProgress?.({
        status: "generating_segments",
        currentSegment: 2,
        totalSegments,
        message: `Membuat bagian 2-${totalSegments} secara paralel...`,
      });

      // Serialkan segmen 2+ (bukan paralel) + jeda 2 detik agar tidak burst TPM
      for (let i = 1; i < totalSegments; i++) {
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        try {
          const result = await generateSegment(
            categoryId, topic, effectiveDuration, i, totalSegments,
            globalOutline, segment1.summary, affiliateInput, 0, signal,
            staticHookEntries, dynamicHookEntries, usedPatternValues, explicitConfig, usedClosingIds,
            targetDuration, platform
          );
          allScenes.push(...result.scenes);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
          }
          onProgress?.({
            status: "error",
            message: `Gagal di bagian ${i + 1} dari ${totalSegments}`,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          throw error;
        }

        // Jeda 2 detik antar segmen agar tidak burst TPM
        if (i < totalSegments - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    // Step 3: Final validation
    onProgress?.({ status: "validating", message: "Memvalidasi script..." });
    const validatedScenes = validateScriptScenes(allScenes, config);

    // Keuangan disclaimer
    let finalScenes = validatedScenes;
    if (categoryId === "keuangan") {
      finalScenes = [
        ...validatedScenes,
        {
          narration: "Penting untuk diingat: konten ini hanya bersifat edukatif dan informatif, bukan merupakan saran investasi atau rekomendasi finansial. Setiap keputusan investasi memiliki risiko. Selalu lakukan riset mandiri dan konsultasikan dengan penasihat keuangan profesional sebelum mengambil keputusan investasi.",
          content: "Penting untuk diingat: konten ini hanya bersifat edukatif dan informatif, bukan merupakan saran investasi atau rekomendasi finansial. Setiap keputusan investasi memiliki risiko. Selalu lakukan riset mandiri dan konsultasikan dengan penasihat keuangan profesional sebelum mengambil keputusan investasi.",
          scene_mood: "netral",
          sceneMood: "netral",
          image_prompt: "Disclaimer text overlay on calm gradient background, professional and clean design, neutral colors, informative style",
          is_conclusion: true,
          isConclusion: true,
          is_hook: false,
        },
      ];
    }

    // Tandai scene terakhir sebagai is_conclusion
    if (finalScenes.length > 0) {
      finalScenes[finalScenes.length - 1] = {
        ...finalScenes[finalScenes.length - 1],
        is_conclusion: true,
        isConclusion: true,
      };
    }

    // Validasi closing scene
    const closingValidation = validateClosingScene(finalScenes);
    if (!closingValidation.valid) {
      console.warn(`[ClosingValidation] ${categoryId}: ${closingValidation.errors.join("; ")}`);
    }

    // Affiliate factuality
    if ((categoryId === "affiliate" || categoryId === "custom") && affiliateInput) {
      const factualityResult = validateAffiliateFactuality(finalScenes, affiliateInput);
      if (factualityResult.flags.length > 0) {
        console.warn(`[AffiliateFactuality] ${factualityResult.flags.length} klaim mencurigakan terdeteksi:`);
        factualityResult.flags.forEach(f => console.warn(`  - Scene ${f.sceneIndex + 1}: ${f.reason} (teks: "${f.text}")`));
      }

      // Comparison mode: validasi khusus (min 2 produk + no hard-sell)
      if (isComparison) {
        const comparisonResult = validateAffiliateComparison(affiliateInput, finalScenes);
        if (!comparisonResult.valid) {
          console.warn(`[AffiliateComparison] ${comparisonResult.errors.length} masalah terdeteksi:`);
          comparisonResult.errors.forEach(e => console.warn(`  - ${e}`));
        }
      }
    }

    // Record usage
    if (identityKey) {
      recordUsage(identityKey, categoryId, hookPatternUsed ?? null, topic).catch(err => {
        console.warn("[usage-history] Gagal menyimpan record (non-blocking):", err);
      });
    }

    // Map to ACS Scene structure
    // Durasi per scene dibagi rata dari targetDuration. JANGAN kunci minimum
    // 10s — untuk video pendek (<60s), scene harus singkat agar total sesuai.
    const durationPerScene = finalScenes.length > 0
      ? Math.max(1, Math.round((input.targetDuration || 60) / finalScenes.length))
      : (input.targetDuration || 60);

    // ===== PENEGAKAN BUDGET KATA — pastikan hasil benar-benar sesuai setup =====
    // Jika targetDuration tersedia, potong narasi agar total kata sesuai target
    // (30s → ~72 kata, 60s → ~144 kata). Ini memastikan audio TTS mendekati durasi setup.
    const budgetWords = input.targetDuration && input.targetDuration > 0
      ? estimateWordsForDuration(input.targetDuration)
      : undefined;

    const mappedScenes: GeneratedScene[] = finalScenes.map((scene, i) => ({
      id: generateId(),
      order: i + 1,
      heading: (scene as { heading?: string }).heading || `Bagian ${i + 1}`,
      content: (scene.narration || scene.content || ""),
      narration: (scene.narration || scene.content || ""),
      sceneMood: (scene.scene_mood || scene.sceneMood || "netral"),
      scene_mood: (scene.scene_mood || scene.sceneMood || "netral"),
      imagePrompt: (scene.image_prompt || scene.visualPrompt || undefined),
      image_prompt: (scene.image_prompt || scene.visualPrompt || undefined),
      visualPrompt: (scene.image_prompt || scene.visualPrompt || undefined),
      duration: durationPerScene,
      isHook: i === 0,
      is_hook: i === 0,
      isConclusion: Boolean(scene.is_conclusion) || i === finalScenes.length - 1,
      is_conclusion: Boolean(scene.is_conclusion) || i === finalScenes.length - 1,
      flagged: Boolean((scene as { flagged?: boolean }).flagged),
    }));

    // Terapkan pemotongan budget kata jika ada target durasi
    const finalMappedScenes = budgetWords
      ? enforceWordBudget(mappedScenes, budgetWords)
      : mappedScenes;

    const fullScript = finalMappedScenes
      .map((s) => `${s.heading}\n${s.content}`)
      .join("\n\n");

    const wordCount = fullScript.split(/\s+/).filter(Boolean).length;

    onProgress?.({ status: "done", message: "Script selesai dibuat!" });

    return {
      id: generateId(),
      title: `${topic} — Faza Studio`,
      scenes: finalMappedScenes,
      fullScript,
      // Estimasi jujur dari wordcount riil (~2.4 kata/detik), bukan menyalin target.
      // Dengan penegakan budget, ini akan mendekati durasi setup.
      estimatedDuration: Math.max(5, Math.round(wordCount / 2.4)),
      wordCount,
      hookPatternUsed,
    };
  } catch (error) {
    console.error("[generateScriptWithAI] Error:", error);
    throw error;
  }
}