import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routing otentikasi — Faza Studio.
 *
 * Publik (tanpa login):
 *   /  (landing)  /masuk  /daftar  /harga  /mulai  /konten/* (editor trial & project anonim)
 *
 * Login wajib:
 *   /beranda  /pengaturan
 *
 * Aturan:
 *   - Belum login & buka route login-wajib  -> /masuk (dengan ?next= tujuan semula)
 *   - Sudah login & buka /masuk atau /daftar -> /beranda
 *   - /konten/* publik karena proyek anonim di-scope oleh identity device
 *     (alur "Coba Gratis" -> editor tanpa daftar).
 */

const LOGIN_REQUIRED_PREFIXES = [
  "/beranda",
  "/pengaturan",
];

// Route publik yang di-redirect ke /beranda jika sudah login.
const GUEST_ONLY = ["/masuk", "/daftar"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ===== Backward-compat redirect (slug lama → baru) =====
  // /project/xxx     -> /konten/xxx
  // /settings        -> /pengaturan
  // /buat            -> /beranda
  let redirectTo: string | null = null;
  if (pathname.startsWith("/project/")) {
    redirectTo = "/konten" + pathname.slice("/project".length);
  } else if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    redirectTo = "/pengaturan" + pathname.slice("/settings".length);
  } else if (pathname === "/buat") {
    redirectTo = "/beranda";
  }

  if (redirectTo) {
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    return NextResponse.redirect(url);
  }

  // Editor trial & project anonim di /konten/* bersifat publik (scoped by
  // identity/device). Hanya /beranda & /pengaturan yang wajib login.
  const isLoginRequired = LOGIN_REQUIRED_PREFIXES.some(
    (p) => pathname.startsWith(p) || pathname === p
  );

  const isGuestOnly = GUEST_ONLY.some((p) => pathname === p);

  // Route publik yang tidak butuh keputusan auth (/, /harga, /mulai, /konten, API dll.)
  if (!isLoginRequired && !isGuestOnly) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();

  if (user && isGuestOnly) {
    url.pathname = "/beranda";
    return NextResponse.redirect(url);
  }

  if (!user && isLoginRequired) {
    url.pathname = "/masuk";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ===== GATE ONBOARDING (REVISI: 4 layer wajib) =====
  // User login yang belum melengkapi Layer 1-4 tidak boleh ke /beranda
  // maupun /pengaturan → diarahkan ke /mulai sampai profil lengkap.
  if (user && isLoginRequired) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("layer1_mode, niche_slug, gaya_key, cerita_key")
        .eq("user_id", user.id)
        .maybeSingle();

      const done =
        profile &&
        profile.layer1_mode &&
        profile.niche_slug &&
        profile.gaya_key &&
        profile.cerita_key;

      if (!done) {
        const mul = request.nextUrl.clone();
        mul.pathname = "/mulai";
        mul.searchParams.set("next", pathname);
        return NextResponse.redirect(mul);
      }
    } catch (e) {
      // Gagal cek profil (error/RLS) → jangan blokir; biarkan user masuk.
      console.warn("[middleware] gate onboarding gagal (dilewati):", (e as Error)?.message);
    }
  }

  return response;
}

export const config = {
  // Lewati API routes, static assets, dan files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)"],
};