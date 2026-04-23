import { NextResponse } from "next/server";
import { requireAdmin, unauthorised } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// PATCH /api/admin/settings/platforms/[id]
// Body: { name?: string; is_active?: boolean }
// ---------------------------------------------------------------------------
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  let body: { name?: string; is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.is_active !== undefined) update.is_active = body.is_active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("platforms")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
