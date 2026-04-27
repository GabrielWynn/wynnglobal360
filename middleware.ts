import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
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

  // Create a request-scoped Supabase client that reads/writes cookies on the
  // NextRequest / NextResponse pair (required by @supabase/ssr in middleware)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Write back to the request so the updated value is visible downstream
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // ------------------------------------------------------------------
  // Root path ( / ) — role-aware redirect
  //   authenticated  → /advisors (hub landing)
  //   unauthenticated → /login
  // ------------------------------------------------------------------
  if (pathname === "/") {
    if (session) {
      return NextResponse.redirect(new URL("/advisors", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ------------------------------------------------------------------
  // Unauthenticated request to a protected route → /login?redirectTo=…
  // ------------------------------------------------------------------
  if (!session && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ------------------------------------------------------------------
  // Authenticated user landing on /login → bounce to /advisors
  // ------------------------------------------------------------------
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/advisors", request.url));
  }

  // ------------------------------------------------------------------
  // Admin-only section: /admin and all sub-paths
  // ------------------------------------------------------------------
  if (session && pathname.startsWith("/admin")) {
    const role = await resolveRole(session.user.id, session.user.email);

    if (role !== "admin") {
      // IFA (or unknown) user → back to their default landing page
      return NextResponse.redirect(new URL("/advisors", request.url));
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
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

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
