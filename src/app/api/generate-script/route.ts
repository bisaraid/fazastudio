/**
 * API Route: Generate Script — ACS ViraLoop-Style
 *
 * Menggunakan engine multi-segment parallel dari ViraLoop dengan:
 * - Auth (API key + same-origin)
 * - Rate limiting (2 layer)
 * - Supabase logging
 */
import { NextRequest, NextResponse } from "next/server";
import { generateScriptWithAI } from "@/lib/script-generator";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { validateApiKey } from "@/lib/api-auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { decrementCredit } from "@/lib/usage";
import { getServerIdentity, deviceCookieOptions, DEVICE_ID_COOKIE } from "@/lib/identity";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // ===== LAPISAN 1: Rate limit universal (sebelum auth) =====
  const layer1 = await checkRateLimit(`acs-layer1:${ip}`, 10, 60_000);
  if (!layer1.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `Terlalu banyak request. Coba lagi dalam ${layer1.resetInSeconds} detik.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": layer1.resetInSeconds.toString(),
          "X-RateLimit-Remaining": layer1.remaining.toString(),
        },
      }
    );
  }

  // ===== AUTH CHECK =====
  const auth = validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || "Unauthorized" }, { status: 401 });
  }

  // ===== LAPISAN 2: Rate limit per jalur (setelah auth) =====
  const layer2Key = auth.isSameOrigin ? `acs-layer2:${ip}:same-origin` : `acs-layer2:${ip}:apikey`;
  const layer2Max = auth.isSameOrigin ? 3 : 10;
  const layer2 = await checkRateLimit(layer2Key, layer2Max, 60_000);
  if (!layer2.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `Terlalu banyak request. Coba lagi dalam ${layer2.resetInSeconds} detik.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": layer2.resetInSeconds.toString(),
          "X-RateLimit-Remaining": layer2.remaining.toString(),
        },
      }
    );
  }

  try {
    const body = await request.json();

    if (!body.topic || !body.categoryId || !body.duration) {
      return NextResponse.json(
        { success: false, error: "Field topic, categoryId, dan duration wajib diisi" },
        { status: 400 }
      );
    }

    // Generate identityKey (stable device cookie, bukan IP)
    const identity = getServerIdentity(request);
    const identityKey = identity.identityKey;

    // ===== CREDIT CHECK (decrement ONCE per project) =====
    const hasCredit = await decrementCredit(identityKey);
    if (!hasCredit) {
      return NextResponse.json(
        { success: false, error: "Kredit kamu habis! Upgrade untuk melanjutkan." },
        { status: 402 }
      );
    }

    // Generate script via ViraLoop engine
    const script = await generateScriptWithAI(
      {
        topic: body.topic,
        categoryId: body.categoryId,
        customGenre: body.customGenre,
        duration: body.duration,
        targetDuration: body.targetDuration || 60,
        platform: body.platform,
        affiliateInput: body.affiliateInput,
        identityKey,
      },
      undefined,
      undefined
    );

    // Simpan ke script_generations (fire-and-forget — non-kritikal)
    try {
      const supabase = createServiceRoleClient();
      const { data: catData } = await supabase
        .from("content_categories")
        .select("id")
        .eq("slug", body.categoryId)
        .single();

      await supabase.from("script_generations").insert({
        category_id: catData?.id ?? null,
        user_input: body.topic,
        hook_pattern_used: script.hookPatternUsed ?? null,
        final_script: JSON.stringify(script.scenes),
        llm_provider: "groq",
      });
    } catch (saveError) {
      console.warn("[generate-script] Gagal simpan ke script_generations:", saveError);
    }

    // ===== PERSIST KE PROJECTS (kritikal — mencegah regenerate saat reload) =====
    // Kolom projects.script bertipe TEXT, jadi simpan sebagai JSON.stringify.
    // Jika projectId tersedia, update projects.script + updated_at.
    // Kegagalan persistence dianggap GAGAL generate — jangan return success.
    if (body.projectId) {
      const supabase = createServiceRoleClient();
      const { error: persistError } = await supabase
        .from("projects")
        .update({
          script: JSON.stringify(script),
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.projectId);

      if (persistError) {
        console.error("[generate-script] Gagal persist script ke projects:", persistError);
        return NextResponse.json(
          { success: false, error: "Script berhasil digenerate tetapi gagal disimpan ke project. Coba lagi." },
          { status: 500 }
        );
      }
      console.log(`[Script] Persist generated script: ${body.projectId}`);
    }

    const res = NextResponse.json({
      success: true,
      data: {
        id: script.id,
        title: script.title,
        scenes: script.scenes,
        fullScript: script.fullScript,
        estimatedDuration: script.estimatedDuration,
        wordCount: script.wordCount,
        hookPatternUsed: script.hookPatternUsed ?? null,
        failedSegment: script.failedSegment ?? null,
      },
    });
    if (identity.isNew) {
      res.cookies.set(DEVICE_ID_COOKIE, identity.deviceId, deviceCookieOptions());
    }
    return res;
  } catch (error) {
    console.error("[generate-script] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Terjadi kesalahan saat generate script" },
      { status: 500 }
    );
  }
}