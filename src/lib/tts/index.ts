/**
 * Text-to-Speech — ACS
 *
 * Adopsi penuh model viralop: provider functions menerima `scenes` + `settings`
 * dan mengembalikan `ArrayBuffer` audio (bukan URL/JSON). Route akan mengembalikan
 * binary audio/mpeg langsung ke client.
 *
 * Provider:
 * - Cartesia (sonic-3.5, key rotation banyak akun)
 * - ElevenLabs (eleven_multilingual_v2, key rotation banyak akun)
 * - Google (Google Cloud TTS resmi jika GOOGLE_TTS_API_KEY ada, fallback node-gtts)
 */

import { loadKeys, executeWithRotation } from "./key-rotator";

export type TTSProvider = "google" | "elevenlabs" | "cartesia";

// ============================================================
// TYPES (mirror viralop)
// ============================================================

export interface CartesiaSettings {
  voice_id: string;
  speed: number; // 0.6 - 1.5
  emotion?: string;
}

export interface ElevenLabsSettings {
  voice_id: string;
  stability: number; // 0.0 - 1.0
  similarity_boost: number; // 0.0 - 1.0
  style: number; // 0.0 - 1.0
  use_speaker_boost: boolean;
  speed: number; // default 1.0
}

export interface GTTSSettings {
  lang: string;
  tld: string;
  slow: boolean;
}

export type TTSSettings = CartesiaSettings | ElevenLabsSettings | GTTSSettings;

/** Scene minimal untuk TTS — ACS Scene.content dipetakan ke narration */
export interface TTSScene {
  narration: string;
}

// ============================================================
// CHUNKING & PREVIEW (dipakai test)
// ============================================================

/**
 * Split teks menjadi chunk per kalimat, tidak memotong tengah kalimat.
 * Jika ada kalimat tunggal > maxChars, force split per maxChars.
 */
export function chunkText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  let currentChunk = "";
  for (const sentence of sentences) {
    if (sentence.trim().length > maxChars) {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      let remaining = sentence;
      while (remaining.length > 0) {
        chunks.push(remaining.slice(0, maxChars).trim());
        remaining = remaining.slice(maxChars);
      }
      continue;
    }

    if ((currentChunk + sentence).length > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Ambil N kata pertama dari teks (untuk preview audio).
 */
export function previewText(text: string, wordLimit: number = 7): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, wordLimit).join(" ");
}

// ============================================================
// CARTESIA (multi-key rotation) — mirror viralop
// ============================================================

// Named voices yang bisa dipilih di UI — berlaku untuk semua API key
const CARTESIA_NAMED_VOICES: Record<string, string> = {
  andi: "a053f6bc-7df4-40de-96d4-de026bc47ce8",
  siti: "b441c4fd-4910-4c55-ae56-f0291057e2cc",
};

function resolveVoiceId(settingsVoiceId: string, envVoiceId?: string): string {
  const lower = settingsVoiceId?.toLowerCase().trim();
  if (lower && CARTESIA_NAMED_VOICES[lower]) {
    return CARTESIA_NAMED_VOICES[lower];
  }
  return envVoiceId || settingsVoiceId;
}

export async function generateCartesiaSpeech(scenes: TTSScene[], settings: CartesiaSettings): Promise<ArrayBuffer> {
  const keys = loadKeys("CARTESIA");
  if (keys.length === 0) {
    throw new Error("Tidak ada CARTESIA_API_KEY_N di environment variables");
  }

  const fullTranscript = scenes.map((s) => s.narration).join(" ");

  return executeWithRotation(keys, async (apiKey, envVoiceId) => {
    const voiceId = resolveVoiceId(settings.voice_id, envVoiceId);

    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Cartesia-Version": "2026-03-01",
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: "sonic-3.5",
        transcript: fullTranscript,
        voice: {
          mode: "id",
          id: voiceId,
        },
        language: "id",
        output_format: {
          container: "mp3",
          sample_rate: 44100,
          bit_rate: 128000,
        },
        generation_config: {
          speed: settings.speed,
          ...(settings.emotion ? { emotion: settings.emotion } : {}),
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Cartesia API error (${response.status}): ${errorBody}`);
    }

    return response.arrayBuffer();
  });
}

// ============================================================
// ELEVENLABS (multi-key rotation) — mirror viralop
// ============================================================

export async function generateElevenLabsSpeech(scenes: TTSScene[], settings: ElevenLabsSettings): Promise<ArrayBuffer> {
  const keys = loadKeys("ELEVENLABS");
  if (keys.length === 0) {
    throw new Error("Tidak ada ELEVENLABS_API_KEY_N di environment variables");
  }

  const fullTranscript = scenes.map((s) => s.narration).join(" ");

  return executeWithRotation(keys, async (apiKey, voiceId) => {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || settings.voice_id}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: "eleven_multilingual_v2",
          text: fullTranscript,
          voice_settings: {
            stability: settings.stability,
            similarity_boost: settings.similarity_boost,
            style: settings.style,
            use_speaker_boost: settings.use_speaker_boost,
            speed: settings.speed,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${errorBody}`);
    }

    return response.arrayBuffer();
  });
}

// ============================================================
// GOOGLE TTS — mirror viralop (Google Cloud resmi + node-gtts fallback)
// ============================================================

const GOOGLE_TTS_API_BASE = "https://texttospeech.googleapis.com/v1";

async function generateGoogleCloudTTS(text: string, lang: string, slow: boolean): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_TTS_API_KEY tidak ditemukan di environment variables");
  }

  const response = await fetch(`${GOOGLE_TTS_API_BASE}/text:synthesize?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: lang === "id" ? "id-ID" : lang,
        name: lang === "id" ? "id-ID-Standard-A" : "en-US-Standard-J",
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: slow ? 0.8 : 1.0,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Google Cloud TTS] Error ${response.status}:`, errorBody);
    throw new Error(`Google Cloud TTS gagal (${response.status}). Coba gunakan provider lain.`);
  }

  const data = await response.json();
  const audioContent = data.audioContent as string;
  return Buffer.from(audioContent, "base64");
}

async function generateGtts(text: string, lang: string = "id"): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const gtts = require("node-gtts")(lang);
  const stream = gtts.stream(text);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function mergeAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const buf of buffers) {
    merged.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return merged.buffer;
}

export async function generateGoogleSpeech(scenes: TTSScene[], settings: GTTSSettings): Promise<ArrayBuffer> {
  const fullText = scenes.map((s) => s.narration).join(". ");

  const hasApiKey = !!process.env.GOOGLE_TTS_API_KEY;
  const maxChars = hasApiKey ? 2000 : 100;
  const chunks = chunkText(fullText, maxChars);

  if (chunks.length === 0) {
    throw new Error("Teks kosong untuk TTS");
  }

  let buffers: Buffer[];
  if (hasApiKey) {
    buffers = await Promise.all(
      chunks.map((chunk) => generateGoogleCloudTTS(chunk, settings.lang || "id", settings.slow))
    );
  } else {
    console.warn("⚠️ GOOGLE_TTS_API_KEY tidak diset — menggunakan node-gtts fallback (endpoint tidak resmi)");
    buffers = await Promise.all(
      chunks.map((chunk) => generateGtts(chunk, settings.lang || "id"))
    );
  }

  if (buffers.length === 1) {
    return (buffers[0].buffer as ArrayBuffer).slice(buffers[0].byteOffset, buffers[0].byteOffset + buffers[0].byteLength);
  }

  return mergeAudioBuffers(buffers.map((b) => (b.buffer as ArrayBuffer).slice(b.byteOffset, b.byteOffset + b.byteLength)));
}