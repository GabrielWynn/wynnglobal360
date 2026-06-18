import { supabaseAdmin } from "@/lib/supabase";
import CompareView from "@/components/model-portfolio/CompareView";
import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";

export default async function ComparePage() {
  const [{ data: platforms }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("mp_platforms").select("id, name, slug").order("name"),
    supabaseAdmin.from("mp_risk_profiles").select("id, label, name").order("risk_level"),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/model-portfolio"
        className="inline-flex items-center gap-1 text-sm transition-opacity hover:opacity-70 mp-text-link"
      >
        <IconChevronLeft size={15} />
        All Platforms
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "var(--wgi-text)" }}>
          Compare Portfolios
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          Select any two platform + profile combinations to compare side-by-side
        </p>
      </div>

      {/* Interactive compare view */}
      <CompareView
        platforms={platforms ?? []}
        profiles={profiles ?? []}
      />
    </div>
  );
}
