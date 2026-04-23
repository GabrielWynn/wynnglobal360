import { NextResponse } from "next/server";
import { requireAuth, unauthorised } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// GET /api/auth/me
//
// Returns the ifas record for the authenticated user.
// Uses the service role to bypass RLS — safe because we validate the Bearer
// token and only return data belonging to that token's own user.
//
// Lookup order:
//   1. ifas.user_id = authenticated user's id  (fast path, post-link)
//   2. ifas.email   = authenticated user's email (fallback, pre-link / invite)
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const userId = await requireAuth(request);
  if (!userId) return unauthorised();

  // 1. Try user_id match
  const { data: byUserId } = await supabaseAdmin
    .from("ifas")
    .select("id, code, name, email, role, status, user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (byUserId) return NextResponse.json(byUserId);

  // 2. Fall back to email match (covers invite / pre-link flows)
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "No IFA record found" }, { status: 404 });
  }

  const { data: byEmail } = await supabaseAdmin
    .from("ifas")
    .select("id, code, name, email, role, status, user_id")
    .ilike("email", email)
    .maybeSingle();

  if (!byEmail) {
    return NextResponse.json({ error: "No IFA record found" }, { status: 404 });
  }

  return NextResponse.json(byEmail);
}
