import { redirect } from "next/navigation";
import Navbar from "@/components/hub/Navbar";
import SessionTimeout from "@/components/SessionTimeout";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ── Server-side role check (defence-in-depth; middleware also checks) ──
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Primary lookup: user_id
  let role: string | null = null;
  const { data: byUserId } = await supabaseAdmin
    .from("ifas")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  role = byUserId?.role ?? null;

  // Fallback: email (handles accounts not yet linked via link-ifa)
  if (!role && user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("role")
      .eq("email", user.email)
      .maybeSingle();
    role = byEmail?.role ?? null;
  }

  if (role !== "admin") redirect("/advisors");

  return (
    <>
      <Navbar />
      <SessionTimeout />
      {/* Content area sits below the fixed 64 px navbar */}
      <div
        className="flex pt-16 min-h-screen"
        style={{ background: "var(--wgi-bg)" }}
      >
        <AdminSidebar />
        {/* pl-56 offsets the fixed 224 px (w-56) sidebar */}
        <main className="flex-1 pl-56 min-w-0">{children}</main>
      </div>
    </>
  );
}
