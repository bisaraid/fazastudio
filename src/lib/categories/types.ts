export type CategoryId =
  | "horror"
  | "misteri"
  | "psikologi"
  | "romance"
  | "motivasi"
  | "edukasi"
  | "affiliate"
  | "sejarah"
  | "keuangan"
  | "custom";

export type ScriptSkeleton = "narrative_arc" | "factual_narrative" | "informational_arc";

export type ClosingMode = "actionable_takeaway" | "cliffhanger_follow" | "open_case_factual";

export type HookPatternType = "pertanyaan" | "angka" | "clickbait_kata" | "netral";

export type Mood =
  | "misterius" | "mencekam" | "gelap" | "intens" | "shock" | "sunyi"
  | "fakta" | "terang" | "hangat" | "sedih" | "rindu" | "netral"
  | "semangat" | "reflektif" | "lega";

export interface NarratorPersona {
  name: string;
  tone: string;
  sentenceRhythm: string;
  signaturePhrases: string[];
  avoidWords: string[];
}

export interface CategoryConfig {
  id: CategoryId;
  name: string;
  persona: string;
  storyStructure: string;
  rules: string;
  validMoods: Mood[];
  styleSuffix?: string;
  temperature?: number;
  exampleScenes?: Array<{
    narration: string;
    scene_mood: string;
    image_prompt?: string;
  }>;
  hookAngles?: string[];
  usesFictionalCharacter: boolean;
  scriptSkeleton: ScriptSkeleton;
  closingMode: ClosingMode;
  narratorPersona: NarratorPersona;
}