/**
 * /api/model-portfolio/admin/platforms
 *
 * GET  → list life companies (mp_platforms)
 * POST → create { name, slug? }
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<boolean> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabaseAdmin
    .from("ifas")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (data?.role === "admin") return true;

  if (user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("role")
      .eq("email", user.email)
      .maybeSingle();
    if (byEmail?.role === "admin") return true;
  }
  return false;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("mp_platforms")
    .select("id, name, slug, created_at")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const name = (body.name as string | undefined)?.trim();
  const slug = ((body.slug as string | undefined)?.trim() || (name ? slugify(name) : "")).toLowerCase();

  if (!name || !slug) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json(
      { error: "Slug must be lowercase letters, numbers, and hyphens only" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("mp_platforms")
    .insert({ name, slug })
    .select("id, name, slug, created_at")
    .maybeSingle();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  revalidatePath("/model-portfolio");
  revalidatePath("/model-portfolio/admin");
  if (data?.slug) {
    revalidatePath(`/model-portfolio/${data.slug}`);
  }

  return NextResponse.json({ ok: true, platform: data });
}
