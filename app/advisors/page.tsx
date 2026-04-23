import CarouselHub from "@/components/hub/CarouselHub";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";

export default async function AdvisorsPage() {
  // Identify the authenticated user from the cookie-based session
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name = "";
  let role: "admin" | "ifa" = "ifa";

  if (user) {
    // Fetch the IFA profile via service role (bypasses RLS — reliable for all cases)
    const { data } = await supabaseAdmin
      .from("ifas")
      .select("name, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      name = data.name ?? "";
      role = data.role ?? "ifa";
    }
  }

  return <CarouselHub name={name} role={role} />;
}
