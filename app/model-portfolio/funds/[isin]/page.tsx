import { notFound } from "next/navigation";
import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";
import { supabaseAdmin } from "@/lib/supabase";
import { formatReturn, returnColor } from "@/lib/model-portfolio";
import { parseFundIdentifier } from "@/lib/fund-identifiers";

interface PageProps {
  params: { isin: string };
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function getFundData(raw: string) {
  const decoded = decodeURIComponent(raw);
  const parsed  = parseFundIdentifier(decoded);
  const storageKey = parsed?.storageKey ?? decoded.toUpperCase();

  const { data: fund } = await supabaseAdmin
    .from("mp_funds")
    .select("id, isin, display_name, currency, ft_symbol, yahoo_symbol")
    .eq("isin", storageKey)
    .maybeSingle();

  if (!fund) return null;

  // All holdings for this fund (across all platforms + profiles + periods)
  const { data: holdings } = await supabaseAdmin
    .from("mp_portfolio_holdings")
    .select(
      `weight, initial_price, final_price, return_pct, weighted_return,
       mp_risk_profiles(label, name),
       mp_portfolio_periods(label, start_date, end_date, is_open, mp_platforms(name, slug))`
    )
    .eq("fund_id", fund.id)
    .order("mp_portfolio_periods(start_date)", { ascending: false });

  // Fund aliases across platforms
  const { data: aliases } = await supabaseAdmin
    .from("mp_fund_aliases")
    .select("alias_name, mp_platforms(name)")
    .eq("fund_id", fund.id);

  // Historical prices (most recent 60 days)
  const { data: prices } = await supabaseAdmin
    .from("mp_fund_prices")
    .select("date, price")
    .eq("fund_id", fund.id)
    .order("date", { ascending: false })
    .limit(60);

  return { fund, holdings: holdings ?? [], aliases: aliases ?? [], prices: prices ?? [] };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function FundDrilldownPage({ params }: PageProps) {
  const data = await getFundData(params.isin);
  if (!data) notFound();

  const { fund, holdings, aliases, prices } = data;

  // Which platforms currently hold this fund (most recent period)
  const platformsUsing = [
    ...new Map(
      holdings
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((h: any) => {
          const plat = Array.isArray(h.mp_portfolio_periods?.mp_platforms)
            ? h.mp_portfolio_periods.mp_platforms[0]
            : h.mp_portfolio_periods?.mp_platforms;
          return plat ? [plat.slug, plat.name] : null;
        })
        .filter(Boolean) as [string, string][]
    ).entries(),
  ];

  // Latest price
  const latestPrice = prices[0];

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/model-portfolio"
        className="inline-flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
        style={{ color: "var(--wgi-accent)" }}
      >
        <IconChevronLeft size={15} />
        Model Portfolio
      </Link>

      {/* Fund header */}
      <div
        className="rounded-2xl border p-6"
        style={{ background: "white", borderColor: "var(--wgi-border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm mb-1" style={{ color: "var(--wgi-text-muted)" }}>
              {fund.isin}
            </p>
            <h1 className="text-xl font-bold leading-tight" style={{ color: "var(--wgi-text)" }}>
              {fund.display_name}
            </h1>

            {/* Platform name aliases */}
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {aliases.map((a: any, i) => {
                  const platName = Array.isArray(a.mp_platforms)
                    ? a.mp_platforms[0]?.name
                    : a.mp_platforms?.name;
                  return (
                    <span
                      key={i}
                      className="text-xs px-2 py-1 rounded-lg"
                      style={{ background: "var(--wgi-bg)", color: "var(--wgi-text-muted)" }}
                    >
                      <span className="font-semibold">{platName}:</span> {a.alias_name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: price + ticker */}
          <div className="text-right">
            {latestPrice ? (
              <>
                <p className="text-2xl font-bold" style={{ color: "var(--wgi-navy)" }}>
                  {latestPrice.price.toFixed(4)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
                  as of {latestPrice.date}
                </p>
              </>
            ) : (
              <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                No live price data
              </p>
            )}
            {(fund.ft_symbol || fund.yahoo_symbol) && (
              <p className="text-xs mt-1 font-mono" style={{ color: "var(--wgi-text-muted)" }}>
                {fund.ft_symbol ? `FT ${fund.ft_symbol}` : `Yahoo ${fund.yahoo_symbol}`}
              </p>
            )}
          </div>
        </div>

        {/* Used-in platforms */}
        {platformsUsing.length > 0 && (
          <div className="mt-4 pt-4 border-t flex flex-wrap gap-2"
               style={{ borderColor: "var(--wgi-border)" }}>
            <span className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>Used in:</span>
            {platformsUsing.map(([slug, name]) => (
              <Link
                key={slug}
                href={`/model-portfolio/${slug}`}
                className="text-xs font-semibold px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity"
                style={{ background: "var(--wgi-navy)", color: "white" }}
              >
                {name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Holdings history table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "var(--wgi-border)" }}
      >
        <div
          className="px-5 py-4 border-b"
          style={{ background: "white", borderColor: "var(--wgi-border)" }}
        >
          <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>
            Appearance History
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
            Every period and profile this fund has appeared in
          </p>
        </div>

        <div className="overflow-x-auto" style={{ background: "white" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--wgi-border)" }}>
                {["Platform", "Period", "Profile", "Weight", "Return", "Contribution", "Status"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--wgi-text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, idx) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const period  = h.mp_portfolio_periods as any;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const profile = Array.isArray(h.mp_risk_profiles) ? h.mp_risk_profiles[0] : h.mp_risk_profiles as any;
                const plat    = Array.isArray(period?.mp_platforms) ? period.mp_platforms[0] : period?.mp_platforms;

                return (
                  <tr
                    key={idx}
                    className="border-b hover:bg-slate-50 transition-colors"
                    style={{
                      borderColor: "var(--wgi-border)",
                      background: idx % 2 === 0 ? "white" : "#fafafa",
                    }}
                  >
                    <td className="px-4 py-2.5 font-semibold text-xs" style={{ color: "var(--wgi-navy)" }}>
                      {plat?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs max-w-[220px] truncate" style={{ color: "var(--wgi-text)" }}>
                      {period?.label ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                        style={{
                          background:
                            profile?.label === "A" ? "#10b981" :
                            profile?.label === "B" ? "#3b82f6" :
                            profile?.label === "C" ? "#f59e0b" : "#ef4444",
                        }}
                      >
                        {profile?.label ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
                      {((h.weight ?? 0) * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2.5 text-sm font-semibold"
                        style={{ color: returnColor(h.return_pct) }}>
                      {formatReturn(h.return_pct)}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-semibold"
                        style={{ color: returnColor(h.weighted_return) }}>
                      {formatReturn(h.weighted_return)}
                    </td>
                    <td className="px-4 py-2.5">
                      {period?.is_open ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: "#fef3c7", color: "#92400e" }}>Open</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: "#ecfdf5", color: "#065f46" }}>Done</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {holdings.length === 0 && (
            <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--wgi-text-muted)" }}>
              No appearance history found for this fund.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
