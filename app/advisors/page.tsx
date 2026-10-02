import CarouselHub from "@/components/hub/CarouselHub";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import type { UserRole } from "@/lib/roles";

export default async function AdvisorsPage() {
  // Identify the authenticated user from the cookie-based session
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name = "";
  let role: UserRole = "ifa";

  if (user) {
    // Try user_id first, fall back to email for rows not yet linked —
    // mirrors the same dual-lookup used in auth-guard and all IFA API routes.
    const { data: byUserId } = await supabaseAdmin
      .from("ifas")
      .select("name, role")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data } = byUserId
      ? { data: byUserId }
      : await supabaseAdmin
          .from("ifas")
          .select("name, role")
          .ilike("email", user.email ?? "")
          .maybeSingle();

    if (data) {
      name = data.name ?? "";
      role = (data.role as UserRole) ?? "ifa";
    }
  }

  return <CarouselHub name={name} role={role} />;
}
