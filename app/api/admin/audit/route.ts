import { NextResponse } from "next/server";
import { requireAdmin, unauthorised } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// GET /api/admin/audit?limit=50&offset=0&action=user.invite
// Returns paginated admin audit log entries, newest first.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return unauthorised();

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  const offset = Number(searchParams.get("offset") ?? "0");
  const action = searchParams.get("action");

  let query = supabaseAdmin
    .from("admin_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) query = query.eq("action", action);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, total: count ?? 0 });
}
