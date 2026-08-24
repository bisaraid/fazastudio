import { NextRequest, NextResponse } from "next/server";
import {
  generateCartesiaSpeech,
  generateElevenLabsSpeech,
  generateGoogleSpeech,
  CartesiaSettings,
  ElevenLabsSettings,
  GTTSSettings,
  TTSScene,
  TTSProvider,
} from "@/lib/tts";
import { validateApiKey } from "@/lib/api-auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getClientIp } from "@/lib/rate-limit";
import { checkCredits } from "@/lib/usage";

/**
 * POST /api/generate-tts
 *
 * Adopsi penuh model viralop:
 * - Terima `scenes` array + `settings` object + `provider` + `preview` + `projectId`
 * - Preview: potong scenes[0].narration ke 7 kata, return binary audio/mpeg (hanya untuk browser)
 * - Non-preview: upload audio ke Supabase Storage bucket `acs-audio`, return JSON { audioUrl }
 *
 * Body:
 * {
 *   scenes: [{ narration: string }],
 *   provider: "cartesia" | "elevenlabs" | "google",
 *   settings: CartesiaSettings | ElevenLabsSettings | GTTSSettings,
 *   preview?: boolean,
 *   projectId?: string (wajib jika non-preview)
 * }
 */
export async function POST(request: NextRequest) {
  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { scenes, provider, settings, preview, projectId } = body;

    // Validasi field wajib
    if (!scenes || !provider || !settings) {
      return NextResponse.json(
        { success: false, error: "Field scenes, provider, dan settings wajib diisi" },
        { status: 400 }
      );
    }

    // Validasi scenes harus array tidak kosong
    if (!Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { success: false, error: "Field scenes harus berupa array yang tidak kosong" },
        { status: 400 }
      );
    }

    // Validasi provider
    const validProviders: TTSProvider[] = ["cartesia", "elevenlabs", "google"];
    if (!validProviders.includes(provider as TTSProvider)) {
      return NextResponse.json(
        { success: false, error: `Provider TTS tidak valid. Pilihan: ${validProviders.join(", ")}` },
        { status: 400 }
      );
    }

    // Jika preview: true, potong narasi scene pertama ke 7 kata
    let scenesToProcess = scenes as TTSScene[];
    if (preview === true) {
      const originalText = scenes[0].narration;
      const truncated = originalText.split(" ").slice(0, 7).join(" ");
      scenesToProcess = [{ ...scenes[0], narration: truncated }];
      console.log(`[TTS] Preview mode: "${truncated}..."`);
    }

    // Fallback chain: coba provider yg dipilih user dulu, lalu ElevenLabs → Cartesia → Google
    const fallbackOrder: TTSProvider[] = ["elevenlabs", "cartesia", "google"];
    const providersToTry = [provider as TTSProvider, ...fallbackOrder.filter((p) => p !== provider)];

    let audioBuffer: ArrayBuffer | undefined;
    let usedProvider: TTSProvider | undefined;

    for (const prov of providersToTry) {
      try {
        switch (prov) {
          case "elevenlabs": {
            audioBuffer = await generateElevenLabsSpeech(scenesToProcess, settings as ElevenLabsSettings);
            break;
          }
          case "cartesia": {
            audioBuffer = await generateCartesiaSpeech(scenesToProcess, settings as CartesiaSettings);
            break;
          }
          case "google": {
            audioBuffer = await generateGoogleSpeech(scenesToProcess, settings as GTTSSettings);
            break;
          }
        }
        if (audioBuffer !== undefined) {
          usedProvider = prov;
          console.log(`[TTS] ✅ Provider ${prov} sukses`);
          break;
        }
      } catch (err) {
        console.warn(`[TTS] ❌ Provider ${prov} gagal, mencoba provider berikutnya...`, err);
      }
    }

    if (audioBuffer === undefined) {
      return NextResponse.json(
        { success: false, error: "Semua provider TTS gagal. Coba lagi atau pilih provider lain." },
        { status: 500 }
      );
    }

    // Convert ArrayBuffer to Buffer untuk upload/response
    const buffer = Buffer.from(audioBuffer);

    // ===== OBSERVASI AUDIO (Tahap E — hanya diagnosis, TIDAK mengubah encoding) =====
    // Deteksi signature/header awal untuk verifikasi format MP3.
    // MP3 frame sync: 0xFF 0xFB atau 0xFF 0xF3 (random), atau ID3 tag: "ID3"
    let formatHint = "unknown";
    if (buffer.length >= 3 && buffer.subarray(0, 3).toString("latin1") === "ID3") {
      formatHint = "MP3 with ID3 header";
    } else if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
      formatHint = "MP3 frame sync";
    } else {
      // Cek header umum lain (WAV "RIFF", OGG "OggS", FLAC "fLaC")
      const first4 = buffer.subarray(0, 4).toString("latin1");
      if (first4 === "RIFF") formatHint = "WAV";
      else if (first4 === "OggS") formatHint = "OGG";
      else if (first4 === "fLaC") formatHint = "FLAC";
    }

    // Estimasi jumlah chunk (untuk diagnosis multi-chunk Google TTS)
    // Konsisten dgn lib/tts index.ts: chunkText maxChars 2000 (hasApiKey) / 100 (fallback)
    const estimatedChunks = buffer.length > 0 ? Math.max(1, Math.ceil(buffer.length / 2000)) : 0;

    console.log(`[TTS] audio buffer: ${buffer.length} bytes`);
    console.log(`[TTS] content-type: audio/mpeg`);
    console.log(`[TTS] format hint: ${formatHint}`);
    console.log(`[TTS] first bytes (hex): ${buffer.subarray(0, 8).toString("hex")}`);
    console.log(`[TTS] estimated chunks (by size): ${estimatedChunks}`);
    // JANGAN log isi audio / API key

    // ===== PREVIEW: return binary audio langsung (hanya untuk browser) =====
    if (preview === true) {
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": buffer.length.toString(),
          "X-TTS-Provider": usedProvider || "",
        },
      });
    }

    // ===== NON-PREVIEW: upload ke Supabase Storage bucket `acs-audio` =====
    // ===== CREDIT CHECK (guard only — credit already decremented at generate-script) =====
    const identityKey = `anon:${getClientIp(request)}`;
    const hasCredit = await checkCredits(identityKey);
    if (!hasCredit) {
      return NextResponse.json(
        { success: false, error: "Kredit kamu habis! Upgrade untuk melanjutkan." },
        { status: 402 }
      );
    }

    // Guard 1: projectId wajib & valid — jangan pernah buat path `undefined/audio.mp3`
    if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Field projectId wajib diisi untuk generate TTS non-preview" },
        { status: 400 }
      );
    }

    // Guard 2: nama file unik agar regenerate tidak menimpa file lama / cache
    const filePath = `${projectId}/audio-${Date.now()}.mp3`;

    const supabase = createServiceRoleClient();
    const { error: uploadError } = await supabase.storage
      .from("acs-audio")
      .upload(filePath, buffer, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("[TTS] Storage upload error:", uploadError);
      return NextResponse.json(
        { success: false, error: "Gagal upload audio ke storage" },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("acs-audio")
      .getPublicUrl(filePath);
    const audioUrl = publicUrlData.publicUrl;

    // Update kolom audio_url di tabel projects
    const { error: updateProjectError } = await supabase
      .from("projects")
      .update({ audio_url: audioUrl, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    if (updateProjectError) {
      console.warn("[TTS] Update projects error:", updateProjectError);
    }

    return NextResponse.json({
      success: true,
      data: {
        audioUrl,
        provider: usedProvider || "",
        fileSize: buffer.length,
      },
    });
  } catch (error) {
    console.error("Generate TTS error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Terjadi kesalahan saat generate audio",
      },
      { status: 500 }
    );
  }
}