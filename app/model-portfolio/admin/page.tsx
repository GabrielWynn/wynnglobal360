import { redirect } from "next/navigation";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";
import AdminHistorySection from "@/components/model-portfolio/AdminHistorySection";
import FundDatabase        from "@/components/model-portfolio/FundDatabase";

// ---------------------------------------------------------------------------
// Admin role guard
// ---------------------------------------------------------------------------

async function getAdminUser() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: byId } = await supabaseAdmin
    .from("ifas")
    .select("role, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (byId?.role === "admin") return { ...byId, email: user.email };

  if (user.email) {
    const { data: byEmail } = await supabaseAdmin
      .from("ifas")
      .select("role, name")
      .eq("email", user.email)
      .maybeSingle();
    if (byEmail?.role === "admin") return { ...byEmail, email: user.email };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ModelPortfolioAdminPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) redirect("/model-portfolio");

  // Only what the history section actually needs
  const [{ data: platforms }, { data: profiles }, { data: funds }] =
    await Promise.all([
      supabaseAdmin.from("mp_platforms").select("id, name, slug").order("name"),
      supabaseAdmin.from("mp_risk_profiles").select("id, label, name").order("risk_level"),
      supabaseAdmin
        .from("mp_funds")
        .select("id, isin, display_name")
        .order("display_name"),
    ]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/model-portfolio"
        className="inline-flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
        style={{ color: "var(--wgi-accent)" }}
      >
        <IconChevronLeft size={15} />
        Model Portfolio
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--wgi-text)" }}>
            Portfolio History
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
            Review, add and edit portfolio compositions across all platforms.
            The IFA chart always reflects the correct holdings for the selected date.
          </p>
        </div>
        <span
          className="text-xs px-3 py-1.5 rounded-full font-semibold"
          style={{ background: "#ecfdf5", color: "#065f46" }}
        >
          Admin
        </span>
      </div>

      {/* Portfolio history + composition management */}
      <AdminHistorySection
        profiles={platforms ? profiles ?? [] : []}
        platforms={platforms ?? []}
        funds={(funds ?? []).map((f) => ({
          id:           f.id,
          isin:         f.isin,
          display_name: f.display_name,
        }))}
      />

      {/* Divider */}
      <div className="h-px" style={{ background: "var(--wgi-border)" }} />

      {/* Fund database */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "var(--wgi-text)" }}>
            Fund Database
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
            Every fund we have ever used across all portfolios — with activity status,
            ticker resolution, and price coverage at a glance.
          </p>
        </div>
        <FundDatabase />
      </div>
    </div>
  );
}
