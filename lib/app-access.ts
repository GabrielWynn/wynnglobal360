import { redirect } from "next/navigation";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import { APP_SLUGS, canOpenApp, isAppSlug, type AppSlug } from "@/lib/apps";
import type { UserRole } from "@/lib/roles";

// ---------------------------------------------------------------------------
// Per-user app access — server-side only (service role).
// Middleware enforces the same rule for every page and API request; the
// helpers here are for layouts, pages and API routes.
// ---------------------------------------------------------------------------

export interface HubUser {
  ifaId: string;
  name: string;
  role: UserRole;
  /** Apps this user can open. Admins get every app. */
  apps: AppSlug[];
}

/** The apps granted to one ifas row. Admins get every app. */
export async function getAllowedApps(ifaId: string, role: string): Promise<AppSlug[]> {
  if (role === "admin") return [...APP_SLUGS];

  const { data, error } = await supabaseAdmin
    .from("user_app_access")
    .select("app_slug")
    .eq("ifa_id", ifaId);

  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r) => (r as { app_slug: string }).app_slug)
    .filter(isAppSlug);
}

/**
 * Resolves the ifas row and app access for a Supabase auth user.
 * Tries user_id first; falls back to email for rows not yet linked.
 */
export async function getHubUser(
  userId: string,
  email: string | null | undefined
): Promise<HubUser | null> {
  type Row = { id: string; name: string | null; role: string | null };

  const { data: byUserId } = await supabaseAdmin
    .from("ifas")
    .select("id, name, role")
    .eq("user_id", userId)
    .maybeSingle();

  let row = byUserId as Row | null;

  if (!row && email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("id, name, role")
      // Case-insensitive match; escape LIKE wildcards so "_" in an address
      // cannot match a different user's row.
      .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
      .maybeSingle();
    row = byEmail as Row | null;
  }

  if (!row) return null;

  const role = (row.role ?? "ifa") as UserRole;
  return {
    ifaId: row.id,
    name: row.name ?? "",
    role,
    apps: await getAllowedApps(row.id, role),
  };
}

/**
 * Guard for an app's layout and pages: redirects to /login without a
 * session and to the hub when the user has not been given this app.
 */
export async function requireAppAccess(slug: AppSlug): Promise<HubUser> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/${slug}`);

  const hubUser = await getHubUser(user.id, user.email);
  if (!hubUser || !canOpenApp(hubUser.role, hubUser.apps, slug)) {
    redirect("/advisors");
  }
  return hubUser;
}

export interface UserWithApps {
  id: string;
  code: string | null;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  user_id: string | null;
  /** Apps this user can open. Admins get every app. */
  apps: AppSlug[];
}

/** Every ifas row with the apps it can open — for the admin Users screen. */
export async function listUsersWithApps(): Promise<UserWithApps[]> {
  const [users, grants] = await Promise.all([
    supabaseAdmin
      .from("ifas")
      .select("id, code, name, email, role, status, user_id")
      .order("name"),
    supabaseAdmin.from("user_app_access").select("ifa_id, app_slug"),
  ]);

  if (users.error) throw new Error(users.error.message);
  if (grants.error) throw new Error(grants.error.message);

  const byUser = new Map<string, AppSlug[]>();
  for (const g of (grants.data ?? []) as { ifa_id: string; app_slug: string }[]) {
    if (!isAppSlug(g.app_slug)) continue;
    byUser.set(g.ifa_id, [...(byUser.get(g.ifa_id) ?? []), g.app_slug]);
  }

  return ((users.data ?? []) as Omit<UserWithApps, "apps">[]).map((u) => ({
    ...u,
    apps: u.role === "admin" ? [...APP_SLUGS] : byUser.get(u.id) ?? [],
  }));
}

/**
 * Gives a user their new role's template apps when they have none — used
 * when an admin (who needs no rows) is changed to another role.
 */
export async function grantRoleDefaultsIfEmpty(
  ifaId: string,
  role: UserRole,
  grantedBy: string | null
): Promise<void> {
  if (role === "admin") return;

  const { count } = await supabaseAdmin
    .from("user_app_access")
    .select("app_slug", { count: "exact", head: true })
    .eq("ifa_id", ifaId);
  if (count) return;

  const { data: defaults } = await supabaseAdmin
    .from("role_app_defaults")
    .select("app_slug")
    .eq("role", role);

  const rows = (defaults ?? []).map((d) => ({
    ifa_id: ifaId,
    app_slug: (d as { app_slug: string }).app_slug,
    granted_by: grantedBy,
  }));
  if (rows.length > 0) await supabaseAdmin.from("user_app_access").insert(rows);
}
