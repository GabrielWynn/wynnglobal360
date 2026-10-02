import { redirect } from "next/navigation";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";

/**
 * Server-side guard for Risk Matrix pages: only admin and compliance users
 * get through. Same lookup as app/financial-planner/admin/layout.tsx
 * (user_id first, email fallback). Called from the layout and from every
 * page that reads data, since a layout is not re-run on client navigation.
 */
export async function requireRiskMatrixAccess(): Promise<void> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/risk-matrix");

  let role: string | null = null;
  const { data: byUserId } = await supabaseAdmin
    .from("ifas")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  role = (byUserId as { role?: string } | null)?.role ?? null;

  if (!role && user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("role")
      .eq("email", user.email)
      .maybeSingle();
    role = (byEmail as { role?: string } | null)?.role ?? null;
  }

  if (role !== "admin" && role !== "compliance") redirect("/advisors");
}
