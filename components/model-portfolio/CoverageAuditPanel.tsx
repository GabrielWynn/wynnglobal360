"use client";

import { useState, useEffect } from "react";
import { IconLoader2, IconRefresh } from "@tabler/icons-react";

interface Summary {
  activeFunds:       number;
  ok:                number;
  stale:             number;
  empty:             number;
  noSource:          number;
  yahooOnly:         number;
  fallbackTargets:   number;
  auditedAt:         string;
}

interface FundRow {
  fundId:         string;
  isin:           string;
  name:           string;
  currency:       string;
  hasFtSymbol:    boolean;
  hasYahooSymbol: boolean;
  platforms:      string[];
  firstPrice:     string | null;
  lastPrice:      string | null;
  rows:           number;
  lastSource:     string | null;
  status:         "ok" | "stale" | "empty" | "no_source" | "yahoo_only";
}

function StatusBadge({ status }: { status: FundRow["status"] }) {
  const cfg = {
    ok:         { bg: "#ecfdf5", color: "#065f46", label: "OK"           },
    yahoo_only: { bg: "#eff6ff", color: "#1d4ed8", label: "Yahoo-fed"    },
    stale:      { bg: "#fef3c7", color: "#92400e", label: "Stale"        },
    empty:      { bg: "#f1f5f9", color: "#475569", label: "No prices"    },
    no_source:  { bg: "#fef2f2", color: "#991b1b", label: "No source"    },
  }[status];

  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function SummaryCard({ label, value, hint, color }: { label: string; value: number; hint?: string; color: string }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--wgi-border)", background: "white" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--wgi-text-muted)" }}>
        {label}
      </p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>{hint}</p>}
    </div>
  );
}

export default function CoverageAuditPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows,    setRows]    = useState<FundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/model-portfolio/admin/coverage-audit");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSummary(data.summary);
      setRows(data.funds ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "var(--wgi-text)" }}>
            Price Coverage Audit
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--wgi-text-muted)" }}>
            Active funds only. FT Markets is primary; Yahoo Finance fills gaps on the daily cron.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-slate-50 disabled:opacity-60"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          <IconRefresh size={13} className={loading ? "animate-spin" : ""} />
          Refresh audit
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading && !summary ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--wgi-text-muted)" }}>
          <IconLoader2 size={16} className="animate-spin" />
          Running audit…
        </div>
      ) : summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard label="Active" value={summary.activeFunds} color="var(--wgi-navy)" />
            <SummaryCard label="OK" value={summary.ok} color="#065f46" />
            <SummaryCard label="Yahoo-fed" value={summary.yahooOnly} hint="FT miss" color="#1d4ed8" />
            <SummaryCard label="Needs sync" value={summary.fallbackTargets} hint="Empty/stale/no source" color="#92400e" />
            <SummaryCard label="Stale" value={summary.stale} color="#b45309" />
            <SummaryCard label="Empty" value={summary.empty} color="#991b1b" />
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--wgi-bg)" }}>
                  {["Status", "ISIN", "Fund", "Last price", "Source", "Rows", "Platforms"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 font-semibold" style={{ color: "var(--wgi-text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.fundId} className="border-t" style={{ borderColor: "var(--wgi-border)", background: "white" }}>
                    <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5 font-mono">{r.isin}</td>
                    <td className="px-4 py-2.5 max-w-[200px] truncate" title={r.name}>{r.name}</td>
                    <td className="px-4 py-2.5">{fmtDate(r.lastPrice)}</td>
                    <td className="px-4 py-2.5 uppercase">{r.lastSource ?? "—"}</td>
                    <td className="px-4 py-2.5">{r.rows.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-[10px]" style={{ color: "var(--wgi-text-muted)" }}>
                      {r.platforms.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
