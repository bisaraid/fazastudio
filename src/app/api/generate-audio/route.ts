import { NextRequest, NextResponse } from "next/server";

/**
 * DEPRECATED — Route ini dihapus.
 *
 * Route audio yang benar adalah /api/generate-tts (real TTS).
 * Route ini sebelumnya MOCK (generateMockAudio) dan tidak dipakai lagi.
 * Dikembalikan 410 Gone agar konsumen lama tahu route sudah tidak tersedia.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { success: false, error: "Route /api/generate-audio sudah dihapus. Gunakan /api/generate-tts." },
    { status: 410 }
  );
}