// ---------------------------------------------------------------------------
// Hub apps — the registry behind per-user app access (user_app_access).
// Dependency-free so it can be imported from middleware, server and client.
//
// The slug is also the app's URL: pages live under /<slug> and API routes
// under /api/<slug>, which is how middleware knows which app a request
// belongs to. To add an app, add it here and, if a role should get it by
// default, add a row to role_app_defaults.
// ---------------------------------------------------------------------------

export const APPS = [
  { slug: "commission", name: "Commission Management", short: "Commission", sensitive: false },
  { slug: "financial-planner", name: "Financial Planner", short: "Planner", sensitive: false },
  { slug: "model-portfolio", name: "Model Portfolio", short: "Portfolio", sensitive: false },
  // Holds KYC data (PEP status, sanctions hits) — granting it asks for confirmation.
  { slug: "risk-matrix", name: "Risk Matrix", short: "Risk Matrix", sensitive: true },
  { slug: "ai-chatbot", name: "AI Assistant", short: "AI", sensitive: false },
] as const;

export type AppSlug = (typeof APPS)[number]["slug"];

export const APP_SLUGS: readonly AppSlug[] = APPS.map((a) => a.slug);

export function isAppSlug(value: unknown): value is AppSlug {
  return (APP_SLUGS as readonly unknown[]).includes(value);
}

/** The app a page or API path belongs to, or null for hub-level paths. */
export function appForPath(pathname: string): AppSlug | null {
  const path = pathname.startsWith("/api/") ? pathname.slice(4) : pathname;
  for (const slug of APP_SLUGS) {
    if (path === `/${slug}` || path.startsWith(`/${slug}/`)) return slug;
  }
  return null;
}

/** Admins can open every app; everyone else needs a user_app_access row. */
export function canOpenApp(
  role: string | null,
  apps: readonly string[],
  slug: AppSlug
): boolean {
  return role === "admin" || apps.includes(slug);
}
