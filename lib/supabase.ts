import {
  createServerClient as _createServerClient,
  createBrowserClient as _createBrowserClient,
  type CookieOptions,
} from "@supabase/ssr";
import {
  createClient as _createAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ---------------------------------------------------------------------------
// Server client — for Server Components, Route Handlers, and Server Actions.
// Reads/writes cookies through next/headers so the session stays in sync.
// ---------------------------------------------------------------------------
export function createServerClient() {
  // Lazy require so pages/ imports of this module don't resolve next/headers
  // at module load time (next/headers is App Router only).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { cookies } = require("next/headers");
  const cookieStore = cookies();

  return _createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Components cannot set cookies; the middleware handles this.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Same as above — safe to ignore in Server Components.
        }
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Browser client — for Client Components ('use client').
// ---------------------------------------------------------------------------
export function createBrowserClient() {
  return _createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// ---------------------------------------------------------------------------
// Admin client — server-side only, bypasses RLS (service role key).
// Never expose this to the browser.
// Guarded so the module can be bundled by client components without crashing:
// SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix and is undefined in
// the browser, causing @supabase/supabase-js to throw at module evaluation.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabaseAdmin: SupabaseClient<any> =
  typeof window === "undefined"
    ? _createAdminClient(
        supabaseUrl,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
    : (null as unknown as SupabaseClient<any>);

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Returns the currently authenticated Supabase user, or null. */
export async function getCurrentUser() {
  if (typeof window !== "undefined") {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  }
  const serverClient = createServerClient();
  const { data: { user }, error } = await serverClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

export type UserType = "admin" | "ifa" | null;

/** Returns the role stored in the ifas table for the current user. */
export async function getUserType(): Promise<UserType> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabaseAdmin
    .from("ifas")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { role: string }).role as UserType;
}

/** Returns { Authorization: "Bearer <access_token>" } for the current session. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  let accessToken: string | undefined;

  if (typeof window !== "undefined") {
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token;
  } else {
    const serverClient = createServerClient();
    const { data: { session } } = await serverClient.auth.getSession();
    accessToken = session?.access_token;
  }

  if (!accessToken) return {};
  return { Authorization: `Bearer ${accessToken}` };
}

// ---------------------------------------------------------------------------
// IFA details
// ---------------------------------------------------------------------------

export interface IFADetails {
  id: string;
  code: string;
  name: string;
  email: string;
  role: "admin" | "ifa";
  status: string;
  user_id: string | null;
}

/**
 * Fetches the ifas record for the current user via /api/auth/me.
 * Uses the session Bearer token so the API route can validate identity.
 */
export async function getIFADetails(): Promise<IFADetails | null> {
  const headers = await getAuthHeaders();
  if (!headers.Authorization) return null;

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const res = await fetch(`${siteUrl}/api/auth/me`, {
    headers,
    cache: "no-store",
  });

  if (!res.ok) return null;
  return res.json() as Promise<IFADetails>;
}

// ---------------------------------------------------------------------------
// Browser singleton — for Commission app pages that import `supabase` directly.
// This is the plain browser client (no SSR cookie wiring).
// ---------------------------------------------------------------------------

/** @deprecated Prefer createBrowserClient() in new code. */
export const supabase = _createBrowserClient(supabaseUrl, supabaseAnonKey);

/**
 * Returns true if the current browser session belongs to an admin user.
 * Queries the ifas table using the browser singleton.
 * @deprecated Use server-side role checks in new code.
 */
export async function isAdmin(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return false;

  const { data } = await supabase
    .from("ifas")
    .select("role")
    .eq("user_id", session.user.id)
    .maybeSingle();

  return data?.role === "admin";
}

// ---------------------------------------------------------------------------
// Post-login IFA linking
// ---------------------------------------------------------------------------

/**
 * After a successful login, calls /api/auth/link-ifa so the server can
 * associate the Supabase user_id with the correct ifas row.
 */
export async function linkIFAOnLogin(): Promise<void> {
  const headers = await getAuthHeaders();
  if (!headers.Authorization) return;

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  await fetch(`${siteUrl}/api/auth/link-ifa`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    cache: "no-store",
  });
}
