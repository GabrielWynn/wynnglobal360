import { redirect } from "next/navigation";
import Navbar from "@/components/hub/Navbar";
import SessionTimeout from "@/components/SessionTimeout";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";

export default async function FinancialPlannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/financial-planner");

  // Ensure user has an ifas record (any role)
  const { data: byUserId } = await supabaseAdmin
    .from("ifas")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!byUserId && user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();
    if (!byEmail) redirect("/advisors");
  }

  return (
    <>
      <Navbar />
      <SessionTimeout />
      <div className="pt-16 min-h-screen" style={{ background: "var(--wgi-bg)" }}>
        {children}
      </div>
    </>
  );
}
