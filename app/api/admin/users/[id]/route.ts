import { NextResponse } from "next/server";
import { requireAdmin, unauthorised } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase";

async function writeAuditLog(
  actorUserId: string,
  action: string,
  targetId: string,
  targetEmail: string | null,
  beforeData: Record<string, unknown>,
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
    before_data: beforeData,
    after_data: afterData,
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/[id]
//
// Role update:   { type: "role",   role: "admin" | "ifa" }
// Status update: { type: "status", action: "deactivate" | "reactivate" }
// ---------------------------------------------------------------------------
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  const { id } = params;

  let body: { type?: string; role?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Role change ──────────────────────────────────────────────────────────
  if (body.type === "role") {
    const { role } = body;

    if (!role || !["admin", "ifa"].includes(role)) {
      return NextResponse.json(
        { error: "role must be admin or ifa" },
        { status: 400 }
      );
    }

    // Fetch current state for audit before_data
    const { data: current } = await supabaseAdmin
      .from("ifas")
      .select("role, email")
      .eq("id", id)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from("ifas")
      .update({ role })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(
      adminId, "user.role_change", id, data.email,
      { role: current?.role },
      { role }
    );

    return NextResponse.json(data);
  }

  // ── Status change (deactivate / reactivate) ──────────────────────────────
  if (body.type === "status") {
    const { action } = body;

    if (!action || !["deactivate", "reactivate"].includes(action)) {
      return NextResponse.json(
        { error: "action must be deactivate or reactivate" },
        { status: 400 }
      );
    }

    const newStatus = action === "deactivate" ? "inactive" : "active";

    // Fetch the current ifas row for user_id + audit before_data
    const { data: ifa, error: fetchError } = await supabaseAdmin
      .from("ifas")
      .select("user_id, email, status")
      .eq("id", id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Sync with Supabase Auth if the user has ever logged in
    if (ifa.user_id) {
      const banDuration = action === "deactivate" ? "876600h" : "none";

      const { error: authError } =
        await supabaseAdmin.auth.admin.updateUserById(ifa.user_id, {
          ban_duration: banDuration,
        });

      if (authError) {
        // Log but treat as non-fatal — ifas.status is the authoritative source
        console.error("[admin/users] Supabase Auth ban error:", authError.message);
      }
    }

    // Update ifas.status
    const { data, error: updateError } = await supabaseAdmin
      .from("ifas")
      .update({ status: newStatus })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await writeAuditLog(
      adminId,
      action === "deactivate" ? "user.deactivate" : "user.reactivate",
      id,
      ifa.email,
      { status: ifa.status },
      { status: newStatus }
    );

    return NextResponse.json(data);
  }

  return NextResponse.json(
    { error: "type must be role or status" },
    { status: 400 }
  );
}
