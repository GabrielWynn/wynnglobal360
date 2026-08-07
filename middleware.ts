import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Routes that do not require authentication
// ---------------------------------------------------------------------------
const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

/** Expire all Supabase auth cookies (including leftover chunked cookies). */
function clearAuthCookies(response: NextResponse, request: NextRequest) {
  for (const { name } of request.cookies.getAll()) {
    if (!isSupabaseAuthCookie(name)) continue;
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  }
}

/** Copy Set-Cookie values from one response onto another (e.g. redirects). */
function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

function isCorruptSessionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "");

  return (
    /Invalid UTF-8 sequence/i.test(message) ||
    /refresh[_ ]token/i.test(message) ||
    /JWT/i.test(message) ||
    /base64/i.test(message)
  );
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow auth API routes through — they handle their own validation
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // Cron routes handle their own Bearer-token auth
  if (pathname.startsWith("/api/model-portfolio/cron/")) {
    return NextResponse.next();
  }

  // Build a mutable response so cookie refreshes are forwarded to the browser
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Missing env should never take the whole site down with a 500
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("middleware: missing Supabase env vars");
    if (isPublicPath(pathname) || pathname.startsWith("/api/")) {
      return response;
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // getAll/setAll is required so leftover auth-token chunks are cleared
  // correctly (the deprecated get/set/remove API leaves stale chunks that
  // decode as "Invalid UTF-8 sequence" and crash middleware on Vercel).
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Prefer getUser() over getSession() — validates with Auth server.
  // Corrupt/chunked cookies throw "Invalid UTF-8 sequence" and must not 500.
  let user: { id: string; email?: string | null } | null = null;
  let clearedCorruptCookies = false;

  try {
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      if (isCorruptSessionError(error)) {
        clearAuthCookies(response, request);
        clearedCorruptCookies = true;
      }
      user = null;
    } else {
      user = authUser;
    }
  } catch (error) {
    console.error("middleware: auth cookie error", error);
    clearAuthCookies(response, request);
    clearedCorruptCookies = true;
    user = null;
  }

  // ------------------------------------------------------------------
  // Root path ( / ) — role-aware redirect
  //   authenticated  → /advisors (hub landing)
  //   unauthenticated → /login
  // ------------------------------------------------------------------
  if (pathname === "/") {
    if (user) {
      const redirect = NextResponse.redirect(new URL("/advisors", request.url));
      copyCookies(response, redirect);
      return redirect;
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.search = request.nextUrl.search;
    const redirect = NextResponse.redirect(loginUrl);
    copyCookies(response, redirect);
    if (clearedCorruptCookies) clearAuthCookies(redirect, request);
    return redirect;
  }

  // ------------------------------------------------------------------
  // Unauthenticated request to a protected route → /login?redirectTo=…
  // ------------------------------------------------------------------
  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    const redirect = NextResponse.redirect(loginUrl);
    copyCookies(response, redirect);
    if (clearedCorruptCookies) clearAuthCookies(redirect, request);
    return redirect;
  }

  // ------------------------------------------------------------------
  // Authenticated user landing on /login → bounce to /advisors
  // ------------------------------------------------------------------
  if (user && pathname === "/login") {
    const redirect = NextResponse.redirect(new URL("/advisors", request.url));
    copyCookies(response, redirect);
    return redirect;
  }

  // ------------------------------------------------------------------
  // Admin-only section: /admin and all sub-paths
  // ------------------------------------------------------------------
  if (user && pathname.startsWith("/admin")) {
    try {
      const role = await resolveRole(user.id, user.email ?? undefined);

      if (role !== "admin") {
        const redirect = NextResponse.redirect(
          new URL("/advisors", request.url)
        );
        copyCookies(response, redirect);
        return redirect;
      }
    } catch (error) {
      console.error("middleware: role resolution failed", error);
      const redirect = NextResponse.redirect(new URL("/advisors", request.url));
      copyCookies(response, redirect);
      return redirect;
    }
  }

  return response;
}

// ---------------------------------------------------------------------------
// Role resolution (service role — bypasses RLS, never reaches the browser)
// ---------------------------------------------------------------------------

/**
 * Returns the `role` from the `ifas` table for the given Supabase user.
 * Tries user_id first; falls back to email for rows not yet linked.
 */
async function resolveRole(
  userId: string,
  email: string | undefined
): Promise<string | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) return null;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Primary: match by user_id
  const { data: byUserId } = await admin
    .from("ifas")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (byUserId) return byUserId.role as string;

  // Fallback: match by email (unlinked rows)
  if (!email) return null;

  const { data: byEmail } = await admin
    .from("ifas")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  return byEmail ? (byEmail.role as string) : null;
}

// ---------------------------------------------------------------------------
// Matcher — skip Next.js internals and static assets
// ---------------------------------------------------------------------------
export const config = {
  matcher: [
    /*
     * Match all paths except:
     *  - _next/static  (static files)
     *  - _next/image   (image optimisation)
     *  - favicon.ico
     *  - common public-asset extensions (svg, png, jpg, jpeg, gif, webp, ico)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
