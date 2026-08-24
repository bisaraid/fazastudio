import { CategoryConfig } from "@/lib/categories/types";

// ============================================================
// SCENE TYPE (kompatibel dengan ACS Scene)
// ============================================================
export interface ValidatableScene {
  narration?: string;
  content?: string;
  heading?: string;
  scene_mood?: string;
  sceneMood?: string;
  image_prompt?: string;
  visualPrompt?: string;
  is_hook?: boolean;
  isHook?: boolean;
  is_conclusion?: boolean;
  isConclusion?: boolean;
  flagged?: boolean;
}

/**
 * Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Synonym mapping for mood fallback
 */
const moodSynonyms: Record<string, string> = {
  seram: "mencekam",
  menakutkan: "mencekam",
  horor: "mencekam",
  horror: "mencekam",
  menyeramkan: "mencekam",
  senang: "terang",
  ceria: "terang",
  gembira: "terang",
  bahagia: "hangat",
  muram: "gelap",
  suram: "gelap",
  kelam: "gelap",
  hening: "sunyi",
  sepi: "sunyi",
  tenang: "netral",
  biasa: "netral",
  netral: "netral",
  kaget: "shock",
  terkejut: "shock",
  terkesima: "shock",
  haru: "sedih",
  pilu: "sedih",
  kecewa: "sedih",
  rindu: "rindu",
  kangen: "rindu",
  lega: "lega",
  plong: "lega",
  semangat: "semangat",
  bersemangat: "semangat",
  antusias: "semangat",
  reflektif: "reflektif",
  kontemplatif: "reflektif",
  hangat: "hangat",
  intim: "hangat",
  misterius: "misterius",
  aneh: "misterius",
  intens: "intens",
  tegang: "intens",
  menegangkan: "intens",
  fakta: "fakta",
  informatif: "fakta",
  edukatif: "fakta",
  cerah: "terang",
  sedih: "sedih",
};

/**
 * Get narration text from a scene (supports both ACS and ViraLoop formats)
 */
function getNarration(scene: ValidatableScene): string {
  return scene.narration || scene.content || "";
}

/**
 * Get mood from a scene (supports both ACS and ViraLoop formats)
 */
function getMood(scene: ValidatableScene): string {
  return scene.scene_mood || scene.sceneMood || "";
}

/**
 * Get image prompt from a scene (supports both ACS and ViraLoop formats)
 */
function getImagePrompt(scene: ValidatableScene): string {
  return scene.image_prompt || scene.visualPrompt || "";
}

/**
 * Validates and corrects a single scene's mood to match valid moods list
 */
export function validateSceneMood(sceneMood: string, validMoods: string[], defaultMood?: string): string {
  const cleanMood = sceneMood.toLowerCase().trim();

  // Exact match
  if (validMoods.includes(cleanMood)) return cleanMood;

  // Synonym mapping
  if (moodSynonyms[cleanMood]) {
    const mapped = moodSynonyms[cleanMood];
    if (validMoods.includes(mapped)) return mapped;
  }

  // Fuzzy match with Levenshtein distance
  const closest = validMoods.reduce<{ mood: string; score: number }>(
    (best, mood) => {
      const score = levenshteinDistance(cleanMood, mood.toLowerCase());
      return score < best.score ? { mood, score } : best;
    },
    { mood: validMoods[0], score: Infinity }
  );

  if (closest.score <= 3) return closest.mood;

  // Fallback to default or first valid mood
  return defaultMood ?? validMoods[0];
}

/**
 * Validates all scenes in a script against the category's valid moods
 */
export function validateScriptScenes(scenes: ValidatableScene[], config: CategoryConfig): ValidatableScene[] {
  return scenes.map((scene) => {
    const mood = getMood(scene);
    const correctedMood = validateSceneMood(mood, config.validMoods as string[], config.validMoods[0] as string);
    return {
      ...scene,
      scene_mood: correctedMood,
      sceneMood: correctedMood,
    };
  });
}

/**
 * Parse JSON from Groq response - handles both json_object and text mode responses
 */
export function parseScriptJson(rawContent: string): { scenes: Array<Record<string, unknown>> } | null {
  try {
    // Try direct parse
    const parsed = JSON.parse(rawContent);
    if (parsed.scenes && Array.isArray(parsed.scenes)) {
      return parsed;
    }
    return null;
  } catch {
    // Try to extract JSON from markdown code block
    const jsonMatch = rawContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        return null;
      }
    }
    // Try to find { "scenes": [...] } pattern anywhere in text
    const scenesMatch = rawContent.match(/\{(?:\s*|[\s\S]*?)"scenes"(?:\s*|[\s\S]*?)\[[\s\S]*?\]\}/);
    if (scenesMatch) {
      try {
        return JSON.parse(scenesMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ============================================================
// CONTENT VALIDATION
// ============================================================

const AFFILIATE_DATA_PATTERNS = [
  /\bRp\b/i,
  /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\b/,
  /%|persen/i,
  /\bkali\b/i,
  /\brating\b/i,
  /\bharga\b/i,
  /\bdiskon\b/i,
  /\bspesifikasi\b/i,
];

const HORROR_SENSORY_WORDS = [
  "suara", "bau", "scent", "suhu", "dingin", "getaran", "sentuh", "rasa", "hembusan", "berdengkur",
  "kuat", "lembut", "menghantui", "mengerikan", "menakutkan", "keremangan", "keramaian", "sunyi", "sepi",
  "derit", "rentak", "detak", "jantung", "napas", "bergerak", "menggigil", "dingin"
];

const DIALOG_PATTERN = /[""「」‘’“”]/;

export function validateContentRules(scenes: ValidatableScene[], categoryId: string): { valid: boolean; flaggedSceneIndices: number[] } {
  const flagged: number[] = [];
  if (categoryId === "affiliate") {
    for (let i = 0; i < scenes.length; i++) {
      const text = `${getNarration(scenes[i])} ${getImagePrompt(scenes[i])}`;
      const hasData = AFFILIATE_DATA_PATTERNS.some(p => p.test(text));
      if (!hasData) flagged.push(i);
    }
    return { valid: flagged.length === 0, flaggedSceneIndices: flagged };
  }
  if (categoryId === "horror") {
    for (let i = 0; i < scenes.length; i++) {
      const text = `${getNarration(scenes[i])} ${getImagePrompt(scenes[i])}`;
      const hasSensory = HORROR_SENSORY_WORDS.some(w => text.toLowerCase().includes(w));
      if (!hasSensory) flagged.push(i);
    }
    return { valid: flagged.length === 0, flaggedSceneIndices: flagged };
  }
  if (categoryId === "romance") {
    for (let i = 0; i < scenes.length; i++) {
      const text = `${getNarration(scenes[i])} ${getImagePrompt(scenes[i])}`;
      const hasDialog = DIALOG_PATTERN.test(text);
      if (!hasDialog) flagged.push(i);
    }
    return { valid: flagged.length === 0, flaggedSceneIndices: flagged };
  }
  return { valid: true, flaggedSceneIndices: [] };
}

// ============================================================
// CLOSING SCENE VALIDATION
// ============================================================

const EMPTY_CLOSING_PHRASES = [
  "sekian",
  "itulah tadi",
  "cukup sekian",
  "terima kasih",
  "sampai jumpa",
  "sekian dari saya",
  "sekian dulu",
  "itu aja",
  "itu saja",
  "begitulah",
  "begitu saja",
  "cukup",
];

const CONCRETE_ELEMENTS = [
  /\d+/,
  /\brp\b/i,
  /\b%\b/,
  /\bcoba\b/i,
  /\blakukan\b/i,
  /\bmulai\b/i,
  /\bgunakan\b/i,
  /\bikuti\b/i,
  /\bbuat\b/i,
  /\bambil\b/i,
  /\bpilih\b/i,
  /\btunggu\b/i,
  /\bfollow\b/i,
  /\bsubscribe\b/i,
  /\bcek\b/i,
  /\blink\b/i,
  /\bapa\b/i,
  /\bkenapa\b/i,
  /\bbagaimana\b/i,
  /\bsiapa\b/i,
];

export function validateClosingScene(scenes: ValidatableScene[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (scenes.length === 0) {
    return { valid: false, errors: ["Tidak ada scene sama sekali"] };
  }

  const lastScene = scenes[scenes.length - 1];

  // Cek is_conclusion
  if (!lastScene.is_conclusion) {
    errors.push("Scene terakhir tidak ditandai is_conclusion=true");
  }

  // Cek narasi tidak kosong
  const narration = getNarration(lastScene).trim();
  if (narration.length === 0) {
    errors.push("Scene closing memiliki narasi kosong");
    return { valid: errors.length === 0, errors };
  }

  // Cek minimal panjang karakter (30 karakter)
  if (narration.length < 30) {
    errors.push(`Scene closing terlalu pendek (${narration.length} karakter, minimal 30)`);
  }

  // Cek apakah narasi diawali frasa generic dan tidak mengandung elemen konkret
  const lowerNarration = narration.toLowerCase();
  const trimmed = lowerNarration.replace(/[^a-z\s]/g, "").trim();

  const startsWithGeneric = EMPTY_CLOSING_PHRASES.some(phrase => {
    return trimmed === phrase || trimmed.startsWith(phrase);
  });

  if (startsWithGeneric) {
    const hasConcrete = CONCRETE_ELEMENTS.some(pattern => pattern.test(narration));
    if (!hasConcrete) {
      errors.push("Scene closing diawali frasa generic tanpa elemen konkret (angka/aksi/rekomendasi)");
    }
  }

  return { valid: errors.length === 0, errors };
}

/* validation failure counters (module-level) */
export const validationFailureCounters: Record<string, number> = {};

// ============================================================
// AFFILIATE FACTUALITY VALIDATION
// ============================================================

export interface AffiliateFactualityResult {
  valid: boolean;
  flags: Array<{
    sceneIndex: number;
    text: string;
    reason: string;
    type: "unverified_stat" | "unverified_certification" | "superlative";
  }>;
}

const PERCENTAGE_PATTERN = /\b\d+(?:[.,]\d+)?\s*%/;

const CERTIFICATION_KEYWORDS = /\b(BPOM|halal|ISO\s*\d+|SNI|teruji\s*klinis|terdaftar\s*(?:di\s*)?BPOM|bersertifikat|tersertifikasi)\b/i;

const SUPERLATIVE_PATTERNS = [
  /\bnomor\s*1\b/i,
  /\b(?:nomor\s*)?satu\s*(?:di|se)\b/i,
  /\bterlaris\b/i,
  /\bterbaik\s*(?:se|di)\b/i,
  /\bpaling\s+(?:laku|laris|baik|populer|diminati)\b/i,
  /\bno\.?\s*1\b/i,
  /\btop\s*(?:satu|1)\b/i,
  /\bbest\s*seller\b/i,
  /\bmost\s+popular\b/i,
];

function extractPercentages(text: string): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(PERCENTAGE_PATTERN.source, "gi");
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

function percentageExistsInInput(percentage: string, inputText: string): boolean {
  const numPart = percentage.replace(/\s*%/, "").trim();
  if (inputText.includes(percentage)) return true;
  if (inputText.includes(`${numPart} persen`)) return true;
  if (inputText.includes(`${numPart}%`)) return true;
  return false;
}

export type AffiliateMode = "single" | "comparison";

export interface AffiliateInput {
  productName: string;
  productDescription: string;
  productPrice?: string;
  productRating?: number;
  affiliateMode?: AffiliateMode;
  comparisonProducts?: Array<{
    productName: string;
    productDescription: string;
    productPrice?: string;
    productRating?: number;
  }>;
}

// ============================================================
// AFFILIATE COMPARISON VALIDATION
// ============================================================

const HARD_SELL_PATTERNS = [
  /\bbeli\s+sekarang\b/i,
  /\bjangan\s+sampai\s+ketinggalan\b/i,
  /\bkehabisan\s+stok\b/i,
  /\bsegera\s+beli\b/i,
  /\bterbatas\s+stok\b/i,
];

export interface AffiliateComparisonValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validasi affiliate comparison mode:
 * 1. Wajib punya minimal 2 comparisonProducts.
 * 2. Tidak boleh ada hard-sell language ("beli sekarang", "jangan sampai ketinggalan").
 *
 * @param affiliateInput - Input affiliate
 * @param scenes - Scene hasil generate (untuk cek hard-sell)
 * @returns { valid, errors }
 */
export function validateAffiliateComparison(
  affiliateInput: AffiliateInput,
  scenes: ValidatableScene[]
): AffiliateComparisonValidationResult {
  const errors: string[] = [];

  // Rule 1: minimal 2 comparisonProducts
  const comparisonCount = affiliateInput.comparisonProducts?.length || 0;
  if (comparisonCount < 2) {
    errors.push(
      `Affiliate comparison mode wajib punya minimal 2 comparisonProducts (saat ini: ${comparisonCount})`
    );
  }

  // Rule 2: tidak boleh ada hard-sell language
  for (let i = 0; i < scenes.length; i++) {
    const narration = getNarration(scenes[i]);
    for (const pattern of HARD_SELL_PATTERNS) {
      if (pattern.test(narration)) {
        errors.push(
          `Scene ${i + 1} mengandung hard-sell language: "${pattern.source}" — tidak diizinkan di comparison mode`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateAffiliateFactuality(
  scenes: ValidatableScene[],
  affiliateInput: AffiliateInput
): AffiliateFactualityResult {
  const flags: AffiliateFactualityResult["flags"] = [];

  const inputTexts: string[] = [affiliateInput.productDescription];
  if (affiliateInput.comparisonProducts) {
    affiliateInput.comparisonProducts.forEach(p => inputTexts.push(p.productDescription));
  }
  const combinedInput = inputTexts.join(" ").toLowerCase();

  for (let i = 0; i < scenes.length; i++) {
    const narration = getNarration(scenes[i]);

    // 1. Deteksi angka persentase yang tidak ada di input
    const percentages = extractPercentages(narration);
    for (const pct of percentages) {
      if (!percentageExistsInInput(pct, combinedInput)) {
        flags.push({
          sceneIndex: i,
          text: pct,
          reason: `Angka persentase "${pct}" tidak ditemukan di input produk — kemungkinan halusinasi statistik`,
          type: "unverified_stat",
        });
      }
    }

    // 2. Deteksi kata kunci sertifikasi yang tidak ada di input
    const certRegex = new RegExp(CERTIFICATION_KEYWORDS.source, "gi");
    let certMatch: RegExpExecArray | null;
    while ((certMatch = certRegex.exec(narration)) !== null) {
      const certWord = certMatch[0].toLowerCase();
      if (!combinedInput.includes(certWord)) {
        flags.push({
          sceneIndex: i,
          text: certMatch[0],
          reason: `Klaim sertifikasi "${certMatch[0]}" tidak disebutkan di input produk`,
          type: "unverified_certification",
        });
      }
    }

    // 3. Deteksi superlatif tak terverifikasi
    for (const pattern of SUPERLATIVE_PATTERNS) {
      const superMatch = narration.match(pattern);
      if (superMatch) {
        const superWord = superMatch[0].toLowerCase();
        if (!combinedInput.includes(superWord)) {
          flags.push({
            sceneIndex: i,
            text: superMatch[0],
            reason: `Superlatif tak terverifikasi "${superMatch[0]}" — tidak ada di input produk`,
            type: "superlative",
          });
        }
      }
    }
  }

  return { valid: flags.length === 0, flags };
}