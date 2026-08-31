import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * API profil user (onboarding & preferensi).
 * - GET  → ambil profil user yang login.
 * - POST → upsert preferensi (genre/platform pilihan).
 *
 * Menggunakan service-role untuk menulis agar lawan RLS (profiles belum punya
 * policy insert untuk anon). Identitas user ditentukan dari sesi cookie via
 * createSupabaseServerClient, bukan dari device_id.
 */
export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("profiles")
    .select("user_id, full_name, genre_tags, platform_tags, has_completed_onboarding, layer1_mode, niche_slug, gaya_key, cerita_key, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[profile] GET error:", error.message);
    return NextResponse.json({ success: false, error: "Gagal memuat profil" }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? null });
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    genreTags?: string[];
    platformTags?: string[];
    fullName?: string;
    layer1Mode?: string;
    nicheSlug?: string;
    gayaKey?: string;
    ceritaKey?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    // body kosong → default
  }

  const service = createServiceRoleClient();
  const { error } = await service.from("profiles").upsert(
    {
      user_id: user.id,
      full_name: body.fullName?.trim() || user.email || null,
      genre_tags: body.genreTags ?? [],
      platform_tags: body.platformTags ?? [],
      layer1_mode: body.layer1Mode ?? null,
      niche_slug: body.nicheSlug ?? null,
      gaya_key: body.gayaKey ?? null,
      cerita_key: body.ceritaKey ?? null,
      has_completed_onboarding: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("[profile] POST error:", error.message);
    return NextResponse.json({ success: false, error: "Gagal menyimpan profil" }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { has_completed_onboarding: true } });
}