import { redirect } from "next/navigation";
import Navbar from "@/components/hub/Navbar";
import SessionTimeout from "@/components/SessionTimeout";
import { createServerClient } from "@/lib/supabase";

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
