import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { setPlanForUserDetailed, type PlanTier } from "@/lib/usage";
import { formatSupabaseError, maskId, newLogRef } from "@/lib/db-error";
import { requireAdmin } from "../_auth";
import { recordAudit } from "@/lib/admin-audit";
import {
  AUTH_MAX_PAGES,
  AuthLookupError,
  findAuthUserByEmail,
  type AuthUserMatch,
} from "@/lib/admin-user-lookup";

const VALID_PLANS: PlanTier[] = ["free", "starter", "pro"];

/**
 * Cari userId dari email via auth.admin.listUsers (service role).
 * Menyisir SEMUA halaman (bukan hanya halaman 1) dan melempar AuthLookupError
 * bila Auth API gagal, supaya route bisa membalas 500 + log — bukan 404 palsu.
 * Detail: src/lib/admin-user-lookup.ts
 */
async function findUserIdByEmail(email: string): Promise<AuthUserMatch> {
  const supabase = createServiceRoleClient();
  return findAuthUserByEmail(async ({ page, perPage }) => {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      // JANGAN di-filter jadi "tidak ditemukan" — hilangkan bukti penyebabnya.
      throw new AuthLookupError(error.message || "Auth API gagal");
    }
    return data?.users ?? [];
  }, email);
}

/**
 * POST /api/admin/set-plan
 * Body: { userId?: string, email?: string, plan: "free"|"starter"|"pro" }
 * Menerima userId ATAU email (untuk aktivasi manual via email di halaman Transaksi).
 */
export async function POST(request: NextRequest) {
  const { user, response: unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, code: "invalid_body", error: "Body tidak valid" },
      { status: 400 }
    );
  }

  const plan = body.plan as PlanTier;
  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json(
      { success: false, code: "invalid_plan", error: "Plan tidak valid" },
      { status: 400 }
    );
  }

  let userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!userId && email) {
    let match: AuthUserMatch;
    try {
      match = await findUserIdByEmail(email);
    } catch (e) {
      // Kegagalan Auth API BUKAN "user tidak ditemukan" → 500 + log penyebab.
      console.warn(
        "[admin-set-plan] lookup email gagal (Auth API):",
        e instanceof Error ? e.message : e
      );
      return NextResponse.json(
        {
          success: false,
          code: "auth_lookup_failed",
          error:
            "Gagal menghubungi layanan Auth untuk mencari user. Coba lagi sebentar lagi.",
        },
        { status: 500 }
      );
    }

    if (match.truncated) {
      console.warn(
        `[admin-set-plan] lookup email berhenti di batas ${AUTH_MAX_PAGES} halaman ` +
          `(${match.scanned} user diperiksa) — hasil belum tentu lengkap.`
      );
    }

    userId = match.userId ?? "";

    if (!userId) {
      const hint = match.suggestions.length
        ? ` Mungkin maksud Anda: ${match.suggestions.join(", ")}.`
        : "";
      console.warn(
        `[admin-set-plan] email belum terdaftar (halaman=${match.pages}, ` +
          `user diperiksa=${match.scanned}, saran=${match.suggestions.length})`
      );
      return NextResponse.json(
        {
          success: false,
          code: "user_not_found",
          error: `Email ${email} belum terdaftar sebagai user. Pastikan user sudah mendaftar.${hint}`,
          suggestions: match.suggestions,
        },
        { status: 404 }
      );
    }
  }

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        code: "user_not_found",
        error: "User tidak ditemukan. Periksa userId/email.",
      },
      { status: 404 }
    );
  }

  const write = await setPlanForUserDetailed(userId, plan);
  if (!write.ok) {
    // Lookup SUKSES tapi TULIS plan ke DB gagal → bedakan dari kedua kegagalan
    // di atas. Penyebab teknis (code/message/details/hint, sudah ter-redaksi)
    // hanya masuk log server; klien hanya menerima kode referensi.
    const ref = newLogRef();
    console.warn(
      `[admin-set-plan] plan_write_failed ref=${ref} stage=${write.stage} ` +
        `plan=${plan} user=${maskId(userId)} ${formatSupabaseError(write.error)}`
    );
    return NextResponse.json(
      {
        success: false,
        code: "plan_write_failed",
        ref,
        // Tanpa detail internal (kode Postgres, nama kolom/tabel).
        error: `Gagal menyimpan plan ke database (kode ${ref}). Hubungi admin/dev dan sebutkan kode ini.`,
      },
      { status: 500 }
    );
  }

  if (user?.id) {
    await recordAudit({
      actorUserId: user.id,
      action: "set_plan",
      subjectUserId: userId,
      subjectEmail: email || undefined,
      payload: { plan },
    });
  }

  return NextResponse.json({ success: true, plan });
}