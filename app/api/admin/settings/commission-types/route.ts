import { NextResponse } from "next/server";
import { requireAdmin, unauthorised } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// GET /api/admin/settings/commission-types
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  const { data, error } = await supabaseAdmin
    .from("commission_types")
    .select("id, code, name, description, is_active, created_at")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// POST /api/admin/settings/commission-types
// Body: { code: string; name: string; description?: string }
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  let body: { code?: string; name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, name, description } = body;
  if (!code?.trim() || !name?.trim()) {
    return NextResponse.json({ error: "code and name are required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("commission_types")
    .insert({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description?.trim() ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data, { status: 201 });
}
