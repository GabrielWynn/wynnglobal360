import { NextResponse } from "next/server";
import { requireAdmin, unauthorised } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// GET /api/admin/settings — return all system settings as { key: value } map
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("key, value, description, updated_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten to { key: value } for easy consumption
  const settings = Object.fromEntries(
    (data ?? []).map(({ key, value }) => [key, value])
  );
  return NextResponse.json({ settings, raw: data });
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/settings — update one or more settings
// Body: { key: string; value: unknown }
// ---------------------------------------------------------------------------
export async function PATCH(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  let body: { key?: string; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { key, value } = body;
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  if (value === undefined) return NextResponse.json({ error: "value is required" }, { status: 400 });

  // Fetch actor's ifas row for updated_by
  const { data: actor } = await supabaseAdmin
    .from("ifas")
    .select("id")
    .eq("user_id", adminId)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .upsert(
      { key, value, updated_by: actor?.id ?? null, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
