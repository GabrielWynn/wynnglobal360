import { redirect } from "next/navigation";
import Navbar from "@/components/hub/Navbar";
import SessionTimeout from "@/components/SessionTimeout";
import SubNav from "@/components/model-portfolio/SubNav";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";

export default async function ModelPortfolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/model-portfolio");
  }

  // Resolve admin role (user_id first, email fallback)
  let isAdmin = false;

  const { data: byId } = await supabaseAdmin
    .from("ifas")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (byId?.role === "admin") {
    isAdmin = true;
  } else if (user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("role")
      .eq("email", user.email)
      .maybeSingle();
    if (byEmail?.role === "admin") isAdmin = true;
  }

  return (
    <>
      <Navbar />
      <SessionTimeout />
      {/* 40 px sub-nav sits directly below the 64 px main navbar */}
      <SubNav isAdmin={isAdmin} />
      {/* pt-[104px] = 64 px navbar + 40 px sub-nav */}
      <div className="pt-[104px] min-h-screen" style={{ background: "var(--wgi-bg)" }}>
        {children}
      </div>
    </>
  );
}
