import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isOnboardingComplete, type PersonaAnswers } from "@/lib/onboarding";

/** String kosong/whitespace → null: kolom persona benar-benar dikosongkan. */
function personaValue(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * API profil user (onboarding & preferensi).
 * - GET  → ambil profil user yang login.
 * - POST → upsert preferensi (genre/platform pilihan).
 *
 * Menggunakan service-role untuk menulis agar lawan RLS (profiles belum punya
 * policy insert untuk anon). Identitas user ditentukan dari sesi cookie via
 * createSupabaseServerClient, bukan dari device_id.
 *
 * `is_admin` (GET) dipakai klien HANYA untuk menampilkan link "Panel Admin".
 * Otorisasi tetap di server (`requireAdmin` di /api/admin/*). Baris yang dibaca
 * selalu baris milik user yang sedang login (filter `user_id = user.id`), jadi
 * flag ini tidak pernah membocorkan status admin akun lain.
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
    .select("user_id, full_name, genre_tags, platform_tags, has_completed_onboarding, layer1_mode, niche_slug, gaya_key, cerita_key, avatar_url, is_admin, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[profile] GET error:", error.message);
    return NextResponse.json({ success: false, error: "Gagal memuat profil" }, { status: 500 });
  }

  // Normalisasi flag ke boolean asli — baris lama/kolom null tetap aman dibaca
  // klien (hanya `true` yang menampilkan link "Panel Admin").
  const payload = data ? { ...data, is_admin: data.is_admin === true } : null;

  return NextResponse.json({ success: true, data: payload });
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
  avatarUrl?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    // body kosong → default
  }

  const service = createServiceRoleClient();

  // PENTING — POST bersifat PATCH: hanya field yang DIKIRIM yang ditulis.
  // Sebelumnya SEMUA kolom persona selalu ditulis (`body.x ?? null`), sehingga
  // body parsial (mis. hanya fullName/genreTags) MENGHAPUS hasil onboarding
  // user. Gate middleware (src/middleware.ts) lalu menganggap user belum
  // onboarding dan melempar dia ke /mulai tanpa henti — pembersihan data diam
  // yang sulit dilacak. Aturan "hanya yang dikirim" menghilangkan kelas bug ini.
  const patch: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };

  if (body.fullName !== undefined) {
    const fullName = body.fullName.trim();
    patch.full_name = fullName || user.email || null;
  }
  if (body.genreTags !== undefined) patch.genre_tags = body.genreTags;
  if (body.platformTags !== undefined) patch.platform_tags = body.platformTags;
  if (body.avatarUrl !== undefined) patch.avatar_url = body.avatarUrl || null;

  const personaTouched =
    body.layer1Mode !== undefined ||
    body.nicheSlug !== undefined ||
    body.gayaKey !== undefined ||
    body.ceritaKey !== undefined;

  if (personaTouched) {
    if (body.layer1Mode !== undefined) patch.layer1_mode = personaValue(body.layer1Mode);
    if (body.nicheSlug !== undefined) patch.niche_slug = personaValue(body.nicheSlug);
    if (body.gayaKey !== undefined) patch.gaya_key = personaValue(body.gayaKey);
    if (body.ceritaKey !== undefined) patch.cerita_key = personaValue(body.ceritaKey);

    // `has_completed_onboarding` baru true bila KEEMPAT layer benar-benar terisi
    // setelah patch diterapkan (gabungan baris lama + nilai baru). Dulu flag ini
    // selalu true walau persona kosong → DB bilang "selesai" sementara gate
    // middleware bilang "belum", dan debugging jadi menyesatkan.
    const { data: current } = await service
      .from("profiles")
      .select("layer1_mode, niche_slug, gaya_key, cerita_key")
      .eq("user_id", user.id)
      .maybeSingle();

    const merged: PersonaAnswers = {
      mode: String(patch.layer1_mode ?? current?.layer1_mode ?? ""),
      niche: String(patch.niche_slug ?? current?.niche_slug ?? ""),
      gaya: String(patch.gaya_key ?? current?.gaya_key ?? ""),
      cerita: String(patch.cerita_key ?? current?.cerita_key ?? ""),
    };
    patch.has_completed_onboarding = isOnboardingComplete(merged);
  }

  const { error } = await service.from("profiles").upsert(patch, { onConflict: "user_id" });

  if (error) {
    console.error("[profile] POST error:", error.message);
    return NextResponse.json({ success: false, error: "Gagal menyimpan profil" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: { has_completed_onboarding: patch.has_completed_onboarding ?? null },
  });
}