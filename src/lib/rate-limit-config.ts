/**
 * Rate limit configuratie — Faza Studio (ACS)
 *
 * Alle limieten op één centrale plek zodat ze makkelijk aan te passen zijn
 * zonder in elke route te zoeken.
 *
 * Daglimieten (24-uur window):
 *   - script: maximaal 20 generate-script per dag
 *   - tts:    maximaal 10 generate-tts (non-preview) per dag
 *   - video:  maximaal 5 generate-video per dag
 *
 * Minuutlimieten (voor providers met eigen quota / duur werk):
 *   - footage: 20 zoekopdrachten Pexels per minuut per identity+IP
 *   - ideasAI: 5 AI-fallback-calls (Groq) per minuut per identity+IP
 */
export const RATE_LIMIT_LIMITS = {
  scriptPerDay: 20, // /api/generate-script
  ttsPerDay: 10,    // /api/generate-tts (non-preview)
  videoPerDay: 5,   // /api/generate-video
  footagePerMinute: 20,  // /api/footage + /api/footage/batch (Pexels)
  ideasAIperMinute: 5,   // /api/ideas (AI fallback, Groq)
  subtitlePerMinute: 10, // /api/generate-subtitle (Whisper/Groq)
} as const;

/** Window 24 uur voor daglimieten (script/tts/video). */
export const DAILY_WINDOW_MS = 24 * 60 * 60_000;

/** Window 1 minuut voor minuutlimieten (footage/ideas). */
export const MINUTE_WINDOW_MS = 60_000;