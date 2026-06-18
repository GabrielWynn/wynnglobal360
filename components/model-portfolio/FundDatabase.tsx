"use client";

import { useState, useEffect, useMemo } from "react";
import { IconRefresh, IconLoader2, IconSearch } from "@tabler/icons-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FundRow {
  id:           string;
  isin:         string;
  name:         string;
  currency:     string;
  ticker:       string | null;
  exchange:     string | null;
  isActive:     boolean;
  platforms:    string[];
  compositions: number;
  firstPrice:   string | null;
  lastPrice:    string | null;
  priceRows:    number;
  tickerStatus: "resolved" | "unresolved";
  priceStatus:  "ok" | "stale" | "empty";
}

type Filter = "all" | "active" | "inactive" | "no_ticker" | "no_prices";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------

function ActivityBadge({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={
        active
          ? { background: "#ecfdf5", color: "#065f46" }
          : { background: "#f1f5f9", color: "#475569" }
      }
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: active ? "var(--mp-gain, #00873E)" : "#94a3b8" }}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function TickerBadge({ status, ticker, exchange }: { status: "resolved" | "unresolved"; ticker: string | null; exchange: string | null }) {
  if (status === "resolved") {
    return (
      <span className="font-mono text-xs px-2 py-0.5 rounded"
            style={{ background: "#f0fdf4", color: "#15803d" }}>
        {ticker}.{exchange}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: "#fef3c7", color: "#92400e" }}>
      No ticker
    </span>
  );
}

function PriceBadge({ status, lastPrice, rows }: { status: "ok" | "stale" | "empty"; lastPrice: string | null; rows: number }) {
  if (status === "empty") {
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fef2f2", color: "#991b1b" }}>No prices</span>;
  }
  if (status === "stale") {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#92400e" }}>
        Stale · {fmtDate(lastPrice)}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ecfdf5", color: "#065f46" }}>
      {fmtDate(lastPrice)} · {rows.toLocaleString()} rows
    </span>
  );
}

// ---------------------------------------------------------------------------
// Summary stats bar
// ---------------------------------------------------------------------------

function StatsBar({ funds }: { funds: FundRow[] }) {
  const total      = funds.length;
  const active     = funds.filter((f) => f.isActive).length;
  const inactive   = total - active;
  const noTicker   = funds.filter((f) => f.tickerStatus === "unresolved").length;
  const noPrices   = funds.filter((f) => f.priceStatus === "empty").length;
  const stale      = funds.filter((f) => f.priceStatus === "stale").length;

  const stat = (label: string, value: number, color: string) => (
    <div key={label}>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--wgi-text-muted)" }}>{label}</p>
    </div>
  );

  return (
    <div className="flex flex-wrap gap-6 px-5 py-4 rounded-xl border"
         style={{ background: "white", borderColor: "var(--wgi-border)" }}>
      {stat("Total Funds",   total,    "var(--wgi-navy)")}
      {stat("Active",        active,   "var(--mp-gain, #00873E)")}
      {stat("Inactive",      inactive, "#94a3b8")}
      {stat("No Ticker",     noTicker, noTicker  > 0 ? "#f59e0b" : "var(--mp-gain, #00873E)")}
      {stat("No Prices",     noPrices, noPrices  > 0 ? "var(--mp-loss, #CC0000)" : "var(--mp-gain, #00873E)")}
      {stat("Stale Prices",  stale,    stale     > 0 ? "#f59e0b" : "var(--mp-gain, #00873E)")}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all",       label: "All"          },
  { key: "active",    label: "Active"       },
  { key: "inactive",  label: "Inactive"     },
  { key: "no_ticker", label: "No Ticker"    },
  { key: "no_prices", label: "No Prices"    },
];

export default function FundDatabase() {
  const [funds,   setFunds]   = useState<FundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<Filter>("all");
  const [query,   setQuery]   = useState("");

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch("/api/model-portfolio/admin/funds/database");
      const data = await res.json();
      setFunds(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
    finally  { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let rows = funds;

    // Filter by tab
    if (filter === "active")    rows = rows.filter((f) => f.isActive);
    if (filter === "inactive")  rows = rows.filter((f) => !f.isActive);
    if (filter === "no_ticker") rows = rows.filter((f) => f.tickerStatus === "unresolved");
    if (filter === "no_prices") rows = rows.filter((f) => f.priceStatus  === "empty");

    // Search
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.isin.toLowerCase().includes(q)  ||
          (f.ticker ?? "").toLowerCase().includes(q)
      );
    }

    return rows;
  }, [funds, filter, query]);

  return (
    <div className="space-y-4">
      {/* Stats */}
      {!loading && <StatsBar funds={funds} />}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        {/* Filter tabs */}
        <div className="flex rounded-xl border overflow-hidden text-xs font-semibold"
             style={{ borderColor: "var(--wgi-border)" }}>
          {FILTERS.map((f, i) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3 py-1.5 transition-colors"
              style={{
                background: filter === f.key ? "var(--wgi-navy)" : "white",
                color:      filter === f.key ? "white" : "var(--wgi-text-muted)",
                borderRight: i < FILTERS.length - 1 ? "1px solid var(--wgi-border)" : undefined,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search + refresh */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--wgi-text-muted)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fund or ISIN…"
              className="pl-8 pr-3 py-1.5 text-xs border rounded-lg focus:outline-none"
              style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)", width: "200px" }}
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg border transition-colors hover:bg-slate-50 disabled:opacity-50"
            style={{ borderColor: "var(--wgi-border)" }}
            title="Refresh"
          >
            <IconRefresh size={14} className={loading ? "animate-spin" : ""}
                         style={{ color: "var(--wgi-text-muted)" }} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
        {loading ? (
          <div className="flex items-center justify-center py-16" style={{ background: "white" }}>
            <IconLoader2 size={22} className="animate-spin" style={{ color: "var(--wgi-text-muted)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ background: "white", color: "var(--wgi-text-muted)" }}>
            No funds match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ background: "white" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--wgi-border)" }}>
                  {[
                    { label: "Fund",       cls: "w-[26%]" },
                    { label: "ISIN",       cls: "w-[12%]" },
                    { label: "Status",     cls: "w-[8%]"  },
                    { label: "Ticker",     cls: "w-[16%]" },
                    { label: "Platforms",  cls: "w-[16%]" },
                    { label: "Compositions", cls: "w-[8%] text-right" },
                    { label: "Price Data", cls: "w-[14%]" },
                  ].map(({ label, cls }) => (
                    <th key={label}
                        className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${cls}`}
                        style={{ color: "var(--wgi-text-muted)" }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((fund, idx) => (
                  <tr
                    key={fund.id}
                    className="border-b hover:bg-slate-50 transition-colors"
                    style={{
                      borderColor: "var(--wgi-border)",
                      background:  idx % 2 === 0 ? "white" : "#fafafa",
                    }}
                  >
                    {/* Fund name */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm leading-tight" style={{ color: "var(--wgi-text)" }}>
                        {fund.name}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
                        {fund.currency}
                      </p>
                    </td>

                    {/* ISIN */}
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--wgi-navy)" }}>
                      {fund.isin}
                    </td>

                    {/* Activity */}
                    <td className="px-4 py-3">
                      <ActivityBadge active={fund.isActive} />
                    </td>

                    {/* Ticker */}
                    <td className="px-4 py-3">
                      <TickerBadge
                        status={fund.tickerStatus}
                        ticker={fund.ticker}
                        exchange={fund.exchange}
                      />
                    </td>

                    {/* Platforms */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {fund.platforms.length === 0 ? (
                          <span className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>—</span>
                        ) : (
                          fund.platforms.map((p) => (
                            <span
                              key={p}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ background: "var(--wgi-bg)", color: "var(--wgi-text-muted)" }}
                            >
                              {p}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Composition count */}
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
                        {fund.compositions}
                      </span>
                    </td>

                    {/* Price status */}
                    <td className="px-4 py-3">
                      <PriceBadge
                        status={fund.priceStatus}
                        lastPrice={fund.lastPrice}
                        rows={fund.priceRows}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-4 py-2.5 border-t text-xs" style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text-muted)" }}>
              Showing {filtered.length} of {funds.length} funds
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
