import { NextResponse } from "next/server";
import { requireAdmin, unauthorised } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase";

async function writeAuditLog(
  actorUserId: string,
  action: string,
  targetId: string | null,
  targetEmail: string | null,
  afterData: Record<string, unknown>
) {
  const { data: actor } = await supabaseAdmin
    .from("ifas")
    .select("id, email")
    .eq("user_id", actorUserId)
    .maybeSingle();

  await supabaseAdmin.from("admin_audit_log").insert({
    actor_id: actor?.id ?? null,
    actor_email: actor?.email ?? actorUserId,
    action,
    target_id: targetId,
    target_email: targetEmail,
    after_data: afterData,
  });
}

// ---------------------------------------------------------------------------
// GET /api/admin/users — list all IFA records
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const userId = await requireAdmin(request);
  if (!userId) return unauthorised();

  const { data, error } = await supabaseAdmin
    .from("ifas")
    .select("id, code, name, email, role, status, user_id")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// POST /api/admin/users — invite a new user
// Body: { name: string; email: string; role: "admin" | "ifa" }
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const userId = await requireAdmin(request);
  if (!userId) return unauthorised();

  let body: { name?: string; email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, email, role } = body;

  if (!name?.trim() || !email?.trim() || !role) {
    return NextResponse.json(
      { error: "name, email and role are required" },
      { status: 400 }
    );
  }

  if (!["admin", "ifa"].includes(role)) {
    return NextResponse.json({ error: "role must be admin or ifa" }, { status: 400 });
  }

  // Guard: prevent duplicate emails in ifas
  const { data: existing } = await supabaseAdmin
    .from("ifas")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  // Send Supabase invite email
  const { data: authData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim(), {
      data: { name: name.trim(), role },
    });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  // Create the ifas record (user_id may already be set if email existed in auth)
  const { data: ifa, error: ifaError } = await supabaseAdmin
    .from("ifas")
    .insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      status: "active",
      user_id: authData.user?.id ?? null,
    })
    .select()
    .single();

  if (ifaError) {
    return NextResponse.json({ error: ifaError.message }, { status: 500 });
  }

  await writeAuditLog(userId, "user.invite", ifa.id, ifa.email, {
    name: ifa.name,
    role: ifa.role,
    status: ifa.status,
  });

  return NextResponse.json(ifa, { status: 201 });
}
