import { NextResponse } from "next/server";
import { requireAdmin, unauthorised } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase";
import { getAllowedApps } from "@/lib/app-access";
import { APP_SLUGS, isAppSlug, type AppSlug } from "@/lib/apps";

// ---------------------------------------------------------------------------
// PUT /api/admin/users/[id]/access
//
// Replaces the list of apps a user can open.
// Body: { apps: string[] }   — app slugs from lib/apps.ts
// ---------------------------------------------------------------------------
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  const { id } = params;

  let body: { apps?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.apps) || !body.apps.every(isAppSlug)) {
    return NextResponse.json(
      { error: `apps must be a list of: ${APP_SLUGS.join(", ")}` },
      { status: 400 }
    );
  }
  const apps = Array.from(new Set(body.apps as AppSlug[]));

  const { data: target, error: targetError } = await supabaseAdmin
    .from("ifas")
    .select("id, email, role")
    .eq("id", id)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.role === "admin") {
    return NextResponse.json(
      { error: "Administrators have access to every app" },
      { status: 400 }
    );
  }

  const { data: actor } = await supabaseAdmin
    .from("ifas")
    .select("id, email")
    .eq("user_id", adminId)
    .maybeSingle();

  let before: AppSlug[];
  try {
    before = await getAllowedApps(id, target.role);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const added = apps.filter((a) => !before.includes(a));
  const removed = before.filter((a) => !apps.includes(a));

  if (removed.length > 0) {
    const { error } = await supabaseAdmin
      .from("user_app_access")
      .delete()
      .eq("ifa_id", id)
      .in("app_slug", removed);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (added.length > 0) {
    const { error } = await supabaseAdmin.from("user_app_access").insert(
      added.map((app_slug) => ({
        ifa_id: id,
        app_slug,
        granted_by: actor?.id ?? null,
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (added.length > 0 || removed.length > 0) {
    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: actor?.id ?? null,
      actor_email: actor?.email ?? adminId,
      action: "user.access_change",
      target_id: id,
      target_email: target.email,
      before_data: { apps: [...before].sort().join(", ") || "none" },
      after_data: { apps: [...apps].sort().join(", ") || "none" },
    });
  }

  return NextResponse.json({ id, apps });
}
