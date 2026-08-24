import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getClientIp } from "@/lib/rate-limit";
import { checkCredits } from "@/lib/usage";

/**
 * POST /api/generate-subtitle
 *
 * Real subtitle via Groq Whisper (OpenAI-compatible endpoint).
 * - Input: audio_url (dari generate-tts) + project_id
 * - Proses: fetch audio → transkripsi ke Groq Whisper → validate segments → SRT/VTT
 * - Output: simpan SRT ke Supabase Storage (artifact turunan), return segments + SRT/VTT
 *
 * SEGMENTS adalah SOURCE OF TRUTH.
 * SRT/VTT adalah derived artifact untuk export/interoperability.
 *
 * Body:
 * {
 *   audioUrl: string (wajib),
 *   projectId: string (wajib)
 * }
 */
const GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

/** Segment transcription dari Groq whisper-large-v3-turbo (verbose_json) */
interface RawSegment {
  id?: number;
  start?: number;
  end?: number;
  text?: string;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

function buildSrt(segments: { start: number; end: number; text: string }[]): string {
  return segments
    .map((seg, i) => {
      const text = seg.text.trim();
      if (!text) return "";
      return `${i + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildVtt(segments: { start: number; end: number; text: string }[]): string {
  return `WEBVTT\n\n${segments
    .map((seg) => {
      const text = seg.text.trim();
      if (!text) return "";
      return `${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n")}`;
}

async function fetchAudioBuffer(audioUrl: string): Promise<Buffer> {
  // Jika data URI base64 (backward compat — bukan primary path)
  if (audioUrl.startsWith("data:audio")) {
    const base64 = audioUrl.split(",")[1];
    if (!base64) throw new Error("Data URI audio tidak valid");
    return Buffer.from(base64, "base64");
  }
  // Jika URL biasa (Supabase storage / http / https)
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`Gagal fetch audio (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Pecah satu segment menjadi beberapa cue subtitle berisi maksimal 3 kata.
 * Timing didistribusikan proporsional berdasarkan jumlah kata tiap chunk.
 * Contoh: segment 0s→6s dengan 6 kata → 3 cue @ 2 kata: 0-2s, 2-4s, 4-6s.
 */
function splitSegmentIntoCues(segment: { start: number; end: number; text: string }): { start: number; end: number; text: string }[] {
  const words = segment.text.split(/\s+/).filter(Boolean);
  if (words.length <= 3) {
    return [{ start: segment.start, end: segment.end, text: words.join(" ") }];
  }
  const duration = segment.end - segment.start;
  const cues: { start: number; end: number; text: string }[] = [];
  let cueStart = segment.start;
  for (let i = 0; i < words.length; i += 3) {
    const chunk = words.slice(i, i + 3);
    const chunkDuration = (chunk.length / words.length) * duration;
    const cueEnd = cueStart + chunkDuration;
    cues.push({ start: cueStart, end: cueEnd, text: chunk.join(" ") });
    cueStart = cueEnd;
  }
  return cues;
}

/**
 * Validasi segments hasil Groq Whisper.
 * Pastikan tiap segment punya start/end/text yang valid.
 */
function validateSegments(rawSegments: RawSegment[]): { start: number; end: number; text: string }[] {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    throw new Error("Groq Whisper tidak mengembalikan segments");
  }

  const valid: { start: number; end: number; text: string }[] = [];

  for (const seg of rawSegments) {
    const start = seg.start;
    const end = seg.end;
    const text = typeof seg.text === "string" ? seg.text.trim() : "";

    if (typeof start !== "number" || typeof end !== "number") {
      console.warn("[Subtitle] Segment tanpa timing valid, dilewati:", JSON.stringify(seg));
      continue;
    }
    if (start < 0 || end < 0 || end <= start) {
      console.warn("[Subtitle] Segment timing tidak valid, dilewati:", JSON.stringify(seg));
      continue;
    }
    if (text.length === 0) {
      console.warn("[Subtitle] Segment text kosong, dilewati:", JSON.stringify(seg));
      continue;
    }

    valid.push({ start, end, text });
  }

  if (valid.length === 0) {
    throw new Error("Groq Whisper mengembalikan segments tapi tidak ada yang valid");
  }

  return valid;
}

export async function POST(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { audioUrl, projectId } = body;

    if (!audioUrl || !projectId) {
      return NextResponse.json(
        { success: false, error: "Field audioUrl dan projectId wajib diisi" },
        { status: 400 }
      );
    }

    // ===== CREDIT CHECK (guard only — credit already decremented at generate-script) =====
    const identityKey = `anon:${getClientIp(request)}`;
    const hasCredit = await checkCredits(identityKey);
    if (!hasCredit) {
      return NextResponse.json(
        { success: false, error: "Kredit kamu habis! Upgrade untuk melanjutkan." },
        { status: 402 }
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json(
        { success: false, error: "GROQ_API_KEY tidak tersedia di .env" },
        { status: 503 }
      );
    }

    console.log("[Subtitle] provider: groq");
    console.log(`[Subtitle] model: ${GROQ_WHISPER_MODEL}`);

    // 1. Fetch audio
    const audioBuffer = await fetchAudioBuffer(audioUrl);
    console.log(`[Subtitle] audio fetched: ${audioBuffer.length} bytes`);

    // 2. Kirim ke Groq Whisper via multipart/form-data
    //    response_format=verbose_json + timestamp_granularities[]=segment → dapat segments timing
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" }),
      "audio.mp3"
    );
    formData.append("model", GROQ_WHISPER_MODEL);
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    const whisperRes = await fetch(GROQ_WHISPER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error("[Subtitle] Groq Whisper error:", whisperRes.status, errText);
      return NextResponse.json(
        { success: false, error: `Groq Whisper API error (${whisperRes.status})` },
        { status: 502 }
      );
    }

    const whisperJson = await whisperRes.json();

    // 3. Ambil & validasi segments (source of truth)
    const rawSegments: RawSegment[] =
      Array.isArray(whisperJson.segments) ? whisperJson.segments : [];
    const validatedSegments = validateSegments(rawSegments);

    console.log(`[Subtitle] segments: ${validatedSegments.length}`);

    // 3b. Pecah tiap segment menjadi cue berisi maksimal 3 kata, timing proporsional.
    //     Ini membuat subtitle burn-in muncul per 1-3 kata, bukan per paragraf.
    const segments = validatedSegments.flatMap(splitSegmentIntoCues);

    console.log(`[Subtitle] cues setelah split: ${segments.length}`);

    // 4. Build SRT/VTT sebagai derived artifact
    const srtContent = buildSrt(segments);
    const vttContent = buildVtt(segments);

    // 5. Upload SRT ke Supabase Storage (artifact turunan)
    const supabase = createServiceRoleClient();
    const filePath = `${projectId}/subtitle-${Date.now()}.srt`;

    const { error: uploadError } = await supabase.storage
      .from("acs-subtitles")
      .upload(filePath, srtContent, {
        contentType: "text/plain",
        upsert: false,
      });

    if (uploadError) {
      console.error("[subtitle] Storage upload error:", uploadError);
      return NextResponse.json(
        { success: false, error: "Gagal upload subtitle ke storage" },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("acs-subtitles")
      .getPublicUrl(filePath);
    const subtitleUrl = publicUrlData.publicUrl;

    // 6. Update kolom subtitle_url di tabel projects
    const { error: updateError } = await supabase
      .from("projects")
      .update({ subtitle_url: subtitleUrl, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    if (updateError) {
      console.warn("[subtitle] Update projects error:", updateError);
    }

    return NextResponse.json({
      success: true,
      data: {
        segments,
        srtContent,
        vttContent,
        language: "id-ID",
        subtitleUrl,
      },
    });
  } catch (error) {
    console.error("[generate-subtitle] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}