"use client";

import { useState } from "react";
import { IconRefresh, IconDatabase, IconCheck, IconX, IconLoader2 } from "@tabler/icons-react";
import PriceCoverageTable from "@/components/model-portfolio/PriceCoverageTable";

interface Fund {
  id: string;
  isin: string;
  display_name: string;
  ft_symbol:    string | null;
  yahoo_symbol: string | null;
}

interface Benchmark { id: string; name: string; ticker: string }

interface Props {
  funds:              Fund[];
  benchmarks:         Benchmark[];
  // periods is kept for signature compatibility but no longer rendered
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  periods:            any[];
  benchmarkPriceRows: number;
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
  const [syncState, setSyncState] = useState<ActionState>("idle");
  const [syncMsg,   setSyncMsg]   = useState("");
  const [seedState, setSeedState] = useState<ActionState>("idle");
  const [seedMsg,   setSeedMsg]   = useState("");
  const [benchState, setBenchState] = useState<ActionState>("idle");
  const [benchMsg,   setBenchMsg]   = useState("");

  async function handleSync() {
    setSyncState("loading"); setSyncMsg("");
    try {
      const res  = await fetch("/api/model-portfolio/admin/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncState("success");
        const { funds: f, benchmarks: b } = data.results ?? {};
        setSyncMsg(
          `${f?.active ?? 0} active funds checked · ${f?.updated ?? 0} updated · ${f?.skipped ?? 0} skipped. ` +
          `Benchmarks: ${b?.updated ?? 0} updated.`
        );
      } else {
        setSyncState("error"); setSyncMsg(data.error ?? "Sync failed");
      }
    } catch {
      setSyncState("error"); setSyncMsg("Network error");
    }
  }

  async function handleSeedActive() {
    setSeedState("loading"); setSeedMsg("");
    try {
      const res  = await fetch("/api/model-portfolio/admin/funds/seed-active", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSeedState("success");
        setSeedMsg(
          `${data.fundsProcessed} funds processed · ${data.totalInserted?.toLocaleString()} rows inserted` +
          (data.errors > 0 ? ` · ${data.errors} errors` : "")
        );
      } else {
        setSeedState("error"); setSeedMsg(data.error ?? "Failed");
      }
    } catch {
      setSeedState("error"); setSeedMsg("Network error");
    }
  }

  async function handleSeedBenchmarks() {
    setBenchState("loading"); setBenchMsg("");
    try {
      const res  = await fetch("/api/model-portfolio/admin/benchmarks/historical", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setBenchState("success");
        const total = (data.results ?? []).reduce((s: number, r: { inserted: number }) => s + r.inserted, 0);
        setBenchMsg(`Seeded ${total.toLocaleString()} rows across ${data.results?.length ?? 0} benchmarks.`);
      } else {
        setBenchState("error"); setBenchMsg(data.error ?? "Failed");
      }
    } catch {
      setBenchState("error"); setBenchMsg("Network error");
    }
  }

  return (
    <div className="rounded-2xl border p-6 space-y-5" style={{ background: "white", borderColor: "var(--wgi-border)" }}>
      <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>Price Sync</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Sync today — active funds only */}
        <Card
          title="Sync Today's Prices"
          desc="Fetches today's NAV for every fund currently active in a composition. Inactive funds are skipped."
          btnLabel="Sync Now"
          btnColor="#1B2D45"
          state={syncState}
          msg={syncMsg}
          icon={<IconRefresh size={15} />}
          onClick={handleSync}
        />

        {/* Smart historical seeder */}
        <Card
          title="Seed Prices for Active Periods"
          desc="Fetches full price history for each fund, scoped to the date range it is actually active in a composition."
          btnLabel="Seed Active Periods"
          btnColor="#8b5cf6"
          state={seedState}
          msg={seedMsg}
          icon={<IconDatabase size={15} />}
          onClick={handleSeedActive}
        />

        {/* Benchmark seeder */}
        <Card
          title="Seed Benchmark History"
          desc={`Fetches historical prices for all benchmarks (S&P 500, MSCI World, etc.). ${benchmarkPriceRows > 0 ? `${benchmarkPriceRows.toLocaleString()} rows stored.` : "Not yet seeded."}`}
          btnLabel={benchmarkPriceRows > 0 ? "Re-seed Benchmarks" : "Seed Benchmarks"}
          btnColor="#1B2D45"
          state={benchState}
          msg={benchMsg}
          icon={<IconDatabase size={15} />}
          onClick={handleSeedBenchmarks}
        />
      </div>
    </div>
  );
}

function Card({
  title, desc, btnLabel, btnColor, state, msg, icon, onClick,
}: {
  title: string; desc: string; btnLabel: string; btnColor: string;
  state: ActionState; msg: string; icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div className="rounded-xl p-4 space-y-3 flex flex-col"
         style={{ background: "var(--wgi-bg)", border: "1px solid var(--wgi-border)" }}>
      <div className="flex-1">
        <p className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>{title}</p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--wgi-text-muted)" }}>{desc}</p>
      </div>
      <button
        onClick={onClick}
        disabled={state === "loading"}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-60 w-fit"
        style={{ background: btnColor }}
      >
        {icon}
        {state === "loading" ? "Working…" : btnLabel}
        <StatusIcon state={state} />
      </button>
      {msg && (
        <p className="text-xs" style={{ color: state === "error" ? "var(--mp-loss, #CC0000)" : "var(--mp-gain, #00873E)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fund Registry (ticker status)
// ---------------------------------------------------------------------------

function FundRegistrySection({ funds }: { funds: Fund[] }) {
  const [filter, setFilter] = useState<"all" | "resolved" | "unresolved">("all");

  const filtered = funds.filter((f) => {
    if (filter === "resolved")   return !!(f.ft_symbol || f.yahoo_symbol);
    if (filter === "unresolved") return !(f.ft_symbol || f.yahoo_symbol);
    return true;
  });

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
      <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3"
           style={{ background: "white", borderColor: "var(--wgi-border)" }}>
        <div>
          <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>Fund Registry</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
            All ISINs known to the system · {funds.filter(f => f.ft_symbol || f.yahoo_symbol).length}/{funds.length} price sources resolved
          </p>
        </div>
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
              {["Fund", "ISIN", "FT Symbol", "Yahoo Symbol", "Status"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--wgi-text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((fund, idx) => (
              <tr key={fund.id} className="border-b hover:bg-slate-50"
                  style={{ borderColor: "var(--wgi-border)", background: idx % 2 === 0 ? "white" : "#fafafa" }}>
                <td className="px-4 py-2.5 font-medium text-sm max-w-xs truncate" style={{ color: "var(--wgi-text)" }}>
                  {fund.display_name}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                  {fund.isin}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--wgi-text)" }}>
                  {fund.ft_symbol ?? "—"}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "var(--wgi-text)" }}>
                  {fund.yahoo_symbol ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  {fund.ft_symbol || fund.yahoo_symbol ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "#ecfdf5", color: "#065f46" }}>
                      <IconCheck size={10} /> Resolved
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "#fef3c7", color: "#92400e" }}>Pending</span>
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
// Main export
// ---------------------------------------------------------------------------

export default function AdminPanelClient({ funds, benchmarks, benchmarkPriceRows }: Props) {
  return (
    <div className="space-y-6">
      <PriceSyncSection benchmarkPriceRows={benchmarkPriceRows} />
      <PriceCoverageTable />
      <FundRegistrySection funds={funds} />
    </div>
  );
}
