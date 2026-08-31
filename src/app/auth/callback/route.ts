import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
  const next = searchParams.get("next") ?? "/beranda";

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
      }
      return NextResponse.redirect(`${origin}${next}`);
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
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Gagal -> kembali ke /masuk dengan flag error.
  const errUrl = new URL("/masuk", origin);
  errUrl.searchParams.set("error", "auth");
  return NextResponse.redirect(errUrl.toString());
}