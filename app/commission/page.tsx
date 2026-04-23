import { redirect } from "next/navigation";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";

// /commission → /commission/admin (admin) or /commission/ifa (advisor)
export default async function CommissionPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/commission/ifa");

  let role = "ifa";
  const { data: byId } = await supabaseAdmin
    .from("ifas")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (byId) {
    role = byId.role ?? "ifa";
  } else if (user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("role")
      .eq("email", user.email)
      .maybeSingle();
    role = byEmail?.role ?? "ifa";
  }

  redirect(role === "admin" ? "/commission/admin" : "/commission/ifa");
}
