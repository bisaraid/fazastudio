import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** One-time sync metadata OAuth ke profiles (full_name + avatar_url). */
async function syncProfileFromMetadata(user: any): Promise<void> {
  const md = user?.user_metadata ?? {};
  const fullName = (md.full_name as string) || (md.name as string) || "";
  const avatarUrl = (md.avatar_url as string) || (md.picture as string) || "";
  if (!fullName && !avatarUrl) return;
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/service");
    const svc = createServiceRoleClient();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (fullName) patch.full_name = fullName;
    if (avatarUrl) patch.avatar_url = avatarUrl;
    await svc.from("profiles").upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
  } catch (e) {
    console.warn("[callback] sync profile gagal:", e);
  }
}


/**
 * Callback Supabase Auth — menangani dua alur:
 * 1. Google OAuth  => `?code=`  → exchangeCodeForSession
 * 2. Email OTP     => `?token_hash=` & `?type=email` → verifyOtp
 *
 * Setelah sukses di-redirect ke `next` (default /beranda, atau /mulai bila
 * user baru). Wajib diset sebagai "Redirect URL" di Supabase Auth config
 * (mis. http://localhost:3000/auth/callback dan domain produksi).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // Normalisasi next sebelum dipakai redirect:
  // - null/kosong, "/", atau bukan path valid (tidak diawali "/") -> /beranda
  // - blok "//..." (protokol-relatif) juga -> /beranda (cegah open-redirect)
  const rawNext = searchParams.get("next");
  const next =
    rawNext &&
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    rawNext !== "/"
      ? rawNext
      : "/beranda";

  if (!(code || tokenHash)) {
    return NextResponse.redirect(`${origin}/masuk?error=callback`);
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // ignore — Server Component context
          }
        },
      },
    }
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Klaim data anon (device) -> akun setelah login sukses.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        try {
          const { claimFromRequest } = await import("@/lib/claim");
          await claimFromRequest(user.id, request);
        } catch (e) {
          console.warn("[callback] claim gagal:", e);
        }
      await syncProfileFromMetadata(user);
      }
      return NextResponse.redirect(`${origin}/auth/confirm?next=${encodeURIComponent(next)}`);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type: type as any, token_hash: tokenHash });
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        try {
          const { claimFromRequest } = await import("@/lib/claim");
          await claimFromRequest(user.id, request);
        } catch (e) {
          console.warn("[callback] claim gagal:", e);
        }
      await syncProfileFromMetadata(user);
      }
      return NextResponse.redirect(`${origin}/auth/confirm?next=${encodeURIComponent(next)}`);
    }
  }

  // Gagal -> kembali ke /masuk dengan flag error.
  const errUrl = new URL("/masuk", origin);
  errUrl.searchParams.set("error", "auth");
  return NextResponse.redirect(errUrl.toString());
}