import { NextResponse } from "next/server";
import { createServerClient as _createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Extracts the Bearer token from an Authorization header. */
function extractToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

/**
 * Validates a Bearer token against Supabase and returns the userId on success.
 * Uses a stateless server client (no cookie plumbing needed here).
 */
async function validateToken(token: string): Promise<string | null> {
  const supabase = _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: () => undefined,
        set: () => {},
        remove: () => {},
      },
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user.id;
}

// ---------------------------------------------------------------------------
// Standard 401 response
// ---------------------------------------------------------------------------

export function unauthorised(): NextResponse {
  return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
}

// ---------------------------------------------------------------------------
// requireAuth
// Validates the Bearer token and returns the userId if the session is valid.
// Returns null when the token is missing or invalid.
// ---------------------------------------------------------------------------

export async function requireAuth(request: Request): Promise<string | null> {
  const token = extractToken(request);
  if (!token) return null;
  return validateToken(token);
}

// ---------------------------------------------------------------------------
// requireAdmin
// Validates the Bearer token then checks that the matching ifas row has
// role === 'admin'.  Falls back from user_id lookup to email lookup so
// legacy rows without a user_id are still matched.
// Returns the userId on success, null otherwise.
// ---------------------------------------------------------------------------

export async function requireAdmin(request: Request): Promise<string | null> {
  const token = extractToken(request);
  if (!token) return null;

  const userId = await validateToken(token);
  if (!userId) return null;

  // Primary lookup: match by user_id column
  const { data: byUserId } = await supabaseAdmin
    .from("ifas")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (byUserId) {
    return byUserId.role === "admin" ? userId : null;
  }

  // Fallback: match by email (for rows not yet linked via link-ifa)
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  if (!email) return null;

  const { data: byEmail } = await supabaseAdmin
    .from("ifas")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  if (!byEmail) return null;
  return byEmail.role === "admin" ? userId : null;
}
