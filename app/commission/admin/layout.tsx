import { redirect } from "next/navigation";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import { CommissionNav } from "@/components/commission/CommissionNav";

// Verifies admin role before rendering any /commission/admin/* page.
// The commission layout above already checks for a valid session,
// so here we only need to check the role.
export default async function CommissionAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/commission/admin");
  }

  // Check role via ifas table (user_id first, email fallback)
  let role: string | null = null;

  const { data: byId } = await supabaseAdmin
    .from("ifas")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (byId) {
    role = byId.role;
  } else if (user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("role")
      .eq("email", user.email)
      .maybeSingle();
    role = byEmail?.role ?? null;
  }

  if (role !== "admin") {
    redirect("/commission/ifa");
  }

  return (
    <>
      <CommissionNav />
      {children}
    </>
  );
}
