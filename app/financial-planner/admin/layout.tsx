import { redirect } from "next/navigation";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";

export default async function FinancialPlannerAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  if (role !== "admin") redirect("/financial-planner");

  return <>{children}</>;
}
