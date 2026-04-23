import { NextResponse } from "next/server";
import { requireAuth, unauthorised } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// POST /api/auth/link-ifa
//
// Binds a Supabase auth user to their ifas row by writing user_id.
// Called once after first login (e.g. from the login page or accept-invite).
// Idempotent — safe to call on every login with no side effects.
//
// Response shapes:
//   { linked: true,  ifa_id: string, was_new: false }  — already linked
//   { linked: true,  ifa_id: string, was_new: true  }  — just linked
//   { linked: false, reason: string }                  — no matching ifas row
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const userId = await requireAuth(request);
  if (!userId) return unauthorised();

  // 1. Already linked?
  const { data: alreadyLinked } = await supabaseAdmin
    .from("ifas")
    .select("id, user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (alreadyLinked) {
    return NextResponse.json({ linked: true, ifa_id: alreadyLinked.id, was_new: false });
  }

  // 2. Look up the user's email from Supabase Auth
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;

  if (!email) {
    return NextResponse.json(
      { linked: false, reason: "Authenticated user has no email address" },
      { status: 400 }
    );
  }

  // 3. Find an unlinked ifas row whose email matches
  const { data: ifa, error: ifaError } = await supabaseAdmin
    .from("ifas")
    .select("id, user_id, email")
    .ilike("email", email)
    .is("user_id", null)
    .maybeSingle();

  if (ifaError) {
    return NextResponse.json({ error: ifaError.message }, { status: 500 });
  }

  if (!ifa) {
    // Could be an admin whose row was already linked via a different path,
    // or simply an unrecognised email — not a hard error.
    return NextResponse.json({
      linked: false,
      reason: "No unlinked IFA record found for this email",
    });
  }

  // 4. Write the user_id
  const { error: updateError } = await supabaseAdmin
    .from("ifas")
    .update({ user_id: userId })
    .eq("id", ifa.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ linked: true, ifa_id: ifa.id, was_new: true });
}
