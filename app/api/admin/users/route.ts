import { NextResponse } from "next/server";
import { requireAdmin, unauthorised } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ROLES, isUserRole } from "@/lib/roles";

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
// Body: { name: string; email: string; role: "admin" | "ifa" | "compliance" }
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

  if (!isUserRole(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${USER_ROLES.join(", ")}` },
      { status: 400 }
    );
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

  // Create the ifas record first so a failed insert never leaves an invited
  // auth user without a matching row. ifas.code is NOT NULL; it defaults to
  // the name, the same convention the commission IFA records use.
  const { data: created, error: ifaError } = await supabaseAdmin
    .from("ifas")
    .insert({
      code: name.trim(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      status: "active",
    })
    .select()
    .single();

  if (ifaError) {
    return NextResponse.json({ error: ifaError.message }, { status: 500 });
  }

  let ifa = created;

  // Send Supabase invite email
  const { data: authData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim(), {
      data: { name: name.trim(), role },
    });

  // The email already has a Supabase Auth account (e.g. an earlier invite) —
  // keep the row; it is linked on next login via /api/auth/link-ifa.
  const alreadyRegistered =
    !!inviteError && /already.*registered/i.test(inviteError.message);

  if (inviteError && !alreadyRegistered) {
    await supabaseAdmin.from("ifas").delete().eq("id", ifa.id);
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  if (authData?.user?.id) {
    const { data: linked } = await supabaseAdmin
      .from("ifas")
      .update({ user_id: authData.user.id })
      .eq("id", ifa.id)
      .select()
      .single();
    if (linked) ifa = linked;
  }

  await writeAuditLog(userId, "user.invite", ifa.id, ifa.email, {
    name: ifa.name,
    role: ifa.role,
    status: ifa.status,
  });

  return NextResponse.json(
    { ...ifa, already_registered: alreadyRegistered },
    { status: 201 }
  );
}
