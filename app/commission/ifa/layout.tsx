import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";

export default async function CommissionIFALayout({
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

  return <>{children}</>;
}
