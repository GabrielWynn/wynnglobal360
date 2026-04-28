import { redirect } from "next/navigation";
import { createServerClient, supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";
import AdminPanelClient from "@/components/model-portfolio/AdminPanelClient";

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
// Data
// ---------------------------------------------------------------------------

async function getAdminData() {
  const [
    { data: funds },
    { data: benchmarks },
    { data: periods },
    { data: benchmarkPriceCount },
    { data: fundPriceCount },
  ] = await Promise.all([
    supabaseAdmin
      .from("mp_funds")
      .select("id, isin, display_name, eodhd_ticker, eodhd_exchange")
      .order("display_name"),
    supabaseAdmin.from("mp_benchmarks").select("id, name, ticker"),
    supabaseAdmin
      .from("mp_portfolio_periods")
      .select("id, label, start_date, end_date, is_open, mp_platforms(name, slug)")
      .order("start_date", { ascending: false }),
    supabaseAdmin
      .from("mp_benchmark_prices")
      .select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("mp_fund_prices")
      .select("*", { count: "exact", head: true }),
  ]);

  const resolvedFunds   = (funds ?? []).filter((f) => f.eodhd_ticker).length;
  const unresolvedFunds = (funds ?? []).filter((f) => !f.eodhd_ticker).length;

  return {
    funds:              funds ?? [],
    benchmarks:         benchmarks ?? [],
    periods:            periods ?? [],
    resolvedFunds,
    unresolvedFunds,
    benchmarkPriceRows: (benchmarkPriceCount as unknown as { count: number } | null)?.count ?? 0,
    fundPriceRows:      (fundPriceCount as unknown as { count: number } | null)?.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ModelPortfolioAdminPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) redirect("/model-portfolio");

  const data = await getAdminData();

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 space-y-8">
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
            Admin Panel
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
            Manage market data, benchmarks, and portfolio structure
          </p>
        </div>
        <span
          className="text-xs px-3 py-1.5 rounded-full font-semibold"
          style={{ background: "#ecfdf5", color: "#065f46" }}
        >
          Admin
        </span>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Funds",          value: data.funds.length,              color: "var(--wgi-navy)" },
          { label: "Tickers Resolved",      value: data.resolvedFunds,             color: "#10b981"         },
          { label: "Tickers Missing",       value: data.unresolvedFunds,           color: data.unresolvedFunds > 0 ? "#f59e0b" : "#10b981" },
          { label: "Benchmark Price Rows",  value: data.benchmarkPriceRows,        color: "var(--wgi-navy)" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border p-4"
            style={{ background: "white", borderColor: "var(--wgi-border)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1"
               style={{ color: "var(--wgi-text-muted)" }}>
              {label}
            </p>
            <p className="text-2xl font-bold" style={{ color }}>
              {value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Interactive client panel */}
      <AdminPanelClient
        funds={data.funds}
        benchmarks={data.benchmarks}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        periods={data.periods as any}
        benchmarkPriceRows={data.benchmarkPriceRows}
      />
    </div>
  );
}
