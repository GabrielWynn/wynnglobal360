"use client";

import { useState } from "react";
import { IconRefresh, IconDatabase, IconCheck, IconX, IconLoader2 } from "@tabler/icons-react";

interface Fund {
  id: string;
  isin: string;
  display_name: string;
  eodhd_ticker: string | null;
  eodhd_exchange: string | null;
}

interface Benchmark { id: string; name: string; ticker: string }

interface Period {
  id: string;
  label: string;
  start_date: string;
  end_date: string | null;
  is_open: boolean;
  mp_platforms: { name: string; slug: string } | null;
}

interface Props {
  funds:               Fund[];
  benchmarks:          Benchmark[];
  periods:             Period[];
  benchmarkPriceRows:  number;
}

type ActionState = "idle" | "loading" | "success" | "error";

function StatusIcon({ state }: { state: ActionState }) {
  if (state === "loading") return <IconLoader2 size={16} className="animate-spin" />;
  if (state === "success") return <IconCheck size={16} className="text-emerald-500" />;
  if (state === "error")   return <IconX size={16} className="text-red-500" />;
  return null;
}

// ---------------------------------------------------------------------------
// Price Sync section
// ---------------------------------------------------------------------------

function PriceSyncSection({ benchmarkPriceRows }: { benchmarkPriceRows: number }) {
  const [syncState,  setSyncState]  = useState<ActionState>("idle");
  const [syncMsg,    setSyncMsg]    = useState("");
  const [seedState,  setSeedState]  = useState<ActionState>("idle");
  const [seedMsg,    setSeedMsg]    = useState("");

  async function handleSync() {
    setSyncState("loading");
    setSyncMsg("");
    try {
      // Uses the admin session (cookie) — no secrets exposed to the browser
      const res = await fetch("/api/model-portfolio/admin/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncState("success");
        const { funds, benchmarks: b } = data.results ?? {};
        setSyncMsg(
          `Funds: ${funds?.updated ?? 0} updated, ${funds?.skipped ?? 0} skipped. ` +
          `Benchmarks: ${b?.updated ?? 0} updated.`
        );
      } else {
        setSyncState("error");
        setSyncMsg(data.error ?? "Sync failed");
      }
    } catch {
      setSyncState("error");
      setSyncMsg("Network error");
    }
  }

  async function handleSeedHistorical() {
    setSeedState("loading");
    setSeedMsg("");
    try {
      const res = await fetch("/api/model-portfolio/admin/benchmarks/historical", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setSeedState("success");
        const total = (data.results ?? []).reduce(
          (s: number, r: { inserted: number }) => s + r.inserted, 0
        );
        setSeedMsg(`Seeded ${total.toLocaleString()} price rows across ${data.results?.length ?? 0} benchmarks.`);
      } else {
        setSeedState("error");
        setSeedMsg(data.error ?? "Failed");
      }
    } catch {
      setSeedState("error");
      setSeedMsg("Network error");
    }
  }

  return (
    <div className="rounded-2xl border p-6 space-y-5"
         style={{ background: "white", borderColor: "var(--wgi-border)" }}>
      <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>
        Market Data Sync
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Daily price sync */}
        <div className="flex-1 rounded-xl p-4 space-y-3"
             style={{ background: "var(--wgi-bg)", border: "1px solid var(--wgi-border)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
              Sync Prices (Today)
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
              Fetches latest NAV prices for all funds and benchmarks from EODHD.
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncState === "loading"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: "var(--wgi-navy)" }}
          >
            <IconRefresh size={15} />
            Sync Now
            <StatusIcon state={syncState} />
          </button>
          {syncMsg && (
            <p className="text-xs" style={{ color: syncState === "error" ? "#ef4444" : "#10b981" }}>
              {syncMsg}
            </p>
          )}
        </div>

        {/* Historical benchmark seed */}
        <div className="flex-1 rounded-xl p-4 space-y-3"
             style={{ background: "var(--wgi-bg)", border: "1px solid var(--wgi-border)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
              Seed Historical Benchmark Data
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
              Fetches full history (2020 → today) for all benchmarks. Run once to enable chart overlays.
              {benchmarkPriceRows > 0 && (
                <span className="ml-1 text-emerald-600">
                  ({benchmarkPriceRows.toLocaleString()} rows already stored)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleSeedHistorical}
            disabled={seedState === "loading"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: "#10b981" }}
          >
            <IconDatabase size={15} />
            {benchmarkPriceRows > 0 ? "Re-seed Historical Data" : "Seed Historical Data"}
            <StatusIcon state={seedState} />
          </button>
          {seedMsg && (
            <p className="text-xs" style={{ color: seedState === "error" ? "#ef4444" : "#10b981" }}>
              {seedMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fund Ticker Status
// ---------------------------------------------------------------------------

function FundTickerSection({ funds }: { funds: Fund[] }) {
  const [filter, setFilter] = useState<"all" | "resolved" | "unresolved">("all");

  const filtered = funds.filter((f) => {
    if (filter === "resolved")   return !!f.eodhd_ticker;
    if (filter === "unresolved") return !f.eodhd_ticker;
    return true;
  });

  return (
    <div className="rounded-2xl border overflow-hidden"
         style={{ borderColor: "var(--wgi-border)" }}>
      <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3"
           style={{ background: "white", borderColor: "var(--wgi-border)" }}>
        <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>
          Fund Ticker Status
        </p>
        <div className="flex rounded-lg border overflow-hidden text-xs font-semibold"
             style={{ borderColor: "var(--wgi-border)" }}>
          {(["all", "resolved", "unresolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 transition-colors capitalize"
              style={{
                background: filter === f ? "var(--wgi-navy)" : "white",
                color:      filter === f ? "white" : "var(--wgi-text-muted)",
                borderRight: f !== "unresolved" ? "1px solid var(--wgi-border)" : undefined,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto" style={{ background: "white" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--wgi-border)" }}>
              {["Fund", "ISIN", "EODHD Ticker", "Exchange", "Status"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--wgi-text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((fund) => (
              <tr key={fund.id} className="border-b hover:bg-slate-50"
                  style={{ borderColor: "var(--wgi-border)" }}>
                <td className="px-4 py-2.5 font-medium text-sm max-w-xs truncate"
                    style={{ color: "var(--wgi-text)" }}>
                  {fund.display_name}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                  {fund.isin}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--wgi-text)" }}>
                  {fund.eodhd_ticker ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                  {fund.eodhd_exchange ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  {fund.eodhd_ticker ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "#ecfdf5", color: "#065f46" }}>
                      <IconCheck size={10} /> Resolved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "#fef3c7", color: "#92400e" }}>
                      Pending
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Periods overview
// ---------------------------------------------------------------------------

function PeriodsSection({ periods }: { periods: Period[] }) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");

  const platformNames = [...new Set(
    periods.map((p) => (p.mp_platforms as { name: string } | null)?.name ?? "Unknown")
  )].sort();

  const filtered = selectedPlatform === "all"
    ? periods
    : periods.filter((p) => (p.mp_platforms as { name: string } | null)?.name === selectedPlatform);

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
      <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3"
           style={{ background: "white", borderColor: "var(--wgi-border)" }}>
        <div>
          <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>
            Portfolio Periods
          </p>
          <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
            {periods.filter((p) => p.is_open).length} open · {periods.filter((p) => !p.is_open).length} completed
          </p>
        </div>
        <select
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value)}
          className="text-xs border rounded-lg px-3 py-1.5"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          <option value="all">All platforms</option>
          {platformNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto" style={{ background: "white" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--wgi-border)" }}>
              {["Platform", "Period", "Start", "End", "Status"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--wgi-text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 30).map((p) => (
              <tr key={p.id} className="border-b hover:bg-slate-50"
                  style={{ borderColor: "var(--wgi-border)" }}>
                <td className="px-4 py-2.5 font-medium text-sm" style={{ color: "var(--wgi-navy)" }}>
                  {(p.mp_platforms as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-xs max-w-xs truncate" style={{ color: "var(--wgi-text)" }}>
                  {p.label}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                  {p.start_date}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                  {p.end_date ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  {p.is_open ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "#fef3c7", color: "#92400e" }}>
                      Open
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "#ecfdf5", color: "#065f46" }}>
                      Completed
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 30 && (
          <p className="px-5 py-3 text-xs" style={{ color: "var(--wgi-text-muted)" }}>
            Showing 30 of {filtered.length} periods
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function AdminPanelClient({ funds, benchmarks, periods, benchmarkPriceRows }: Props) {
  return (
    <div className="space-y-6">
      <PriceSyncSection benchmarkPriceRows={benchmarkPriceRows} />
      <FundTickerSection funds={funds} />
      <PeriodsSection periods={periods} />
    </div>
  );
}
