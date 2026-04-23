import { redirect } from "next/navigation";
import Navbar from "@/components/hub/Navbar";
import SessionTimeout from "@/components/SessionTimeout";
import { createServerClient } from "@/lib/supabase";

// Auth is verified by middleware, but we do a lightweight server-side
// session check here so unauthenticated direct hits get a clean redirect.
export default async function CommissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/commission/ifa");
  }

  return (
    <>
      <Navbar />
      <SessionTimeout />
      <div className="pt-16">{children}</div>
    </>
  );
}
