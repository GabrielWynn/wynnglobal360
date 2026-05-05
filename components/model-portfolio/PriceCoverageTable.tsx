"use client";

import { useState, useEffect } from "react";
import { IconLoader2, IconRefresh } from "@tabler/icons-react";

interface CoverageRow {
  fundId:     string;
  isin:       string;
  name:       string;
  hasTicker:  boolean;
  platforms:  string[];
  firstPrice: string | null;
  lastPrice:  string | null;
  rows:       number;
  status:     "ok" | "stale" | "empty" | "no_ticker";
}

function StatusBadge({ status }: { status: CoverageRow["status"] }) {
  const cfg = {
    ok:       { bg: "#ecfdf5", color: "#065f46", label: "OK"        },
    stale:    { bg: "#fef3c7", color: "#92400e", label: "Stale"     },
    empty:    { bg: "#f1f5f9", color: "#475569", label: "No prices" },
    no_ticker:{ bg: "#fef2f2", color: "#991b1b", label: "No ticker" },
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

export default function PriceCoverageTable() {
  const [rows,    setRows]    = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/model-portfolio/admin/price-coverage");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const counts = {
    ok:       rows.filter((r) => r.status === "ok").length,
    stale:    rows.filter((r) => r.status === "stale").length,
    empty:    rows.filter((r) => r.status === "empty").length,
    no_ticker:rows.filter((r) => r.status === "no_ticker").length,
  };

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--wgi-border)" }}>
      {/* Header */}
      <div
        className="px-5 py-4 border-b flex items-center justify-between"
        style={{ background: "white", borderColor: "var(--wgi-border)" }}
      >
        <div>
          <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>
            Price Coverage — Active Funds
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
            Funds currently in at least one active composition ·
            {" "}{counts.ok} OK · {counts.stale > 0 && `${counts.stale} stale · `}
            {counts.empty > 0 && `${counts.empty} empty · `}
            {counts.no_ticker > 0 && `${counts.no_ticker} no ticker`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg border transition-colors hover:bg-slate-50 disabled:opacity-50"
          style={{ borderColor: "var(--wgi-border)" }}
          title="Refresh"
        >
          <IconRefresh size={15} className={loading ? "animate-spin" : ""} style={{ color: "var(--wgi-text-muted)" }} />
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-10" style={{ background: "white" }}>
          <IconLoader2 size={20} className="animate-spin" style={{ color: "var(--wgi-text-muted)" }} />
        </div>
      ) : error ? (
        <div className="px-5 py-6 text-center text-sm text-red-500" style={{ background: "white" }}>
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm" style={{ background: "white", color: "var(--wgi-text-muted)" }}>
          No active compositions found. Run the migration script first.
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ background: "white" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--wgi-border)" }}>
                {["Fund", "ISIN", "Active In", "First Price", "Last Price", "Rows", "Status"].map((h) => (
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
              {rows.map((row, idx) => (
                <tr
                  key={row.fundId}
                  className="border-b hover:bg-slate-50 transition-colors"
                  style={{
                    borderColor: "var(--wgi-border)",
                    background: idx % 2 === 0 ? "white" : "#fafafa",
                  }}
                >
                  <td className="px-4 py-3 font-medium max-w-[200px] truncate" style={{ color: "var(--wgi-text)" }}>
                    {row.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                    {row.isin}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[200px]" style={{ color: "var(--wgi-text-muted)" }}>
                    {row.platforms.join(", ")}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--wgi-text-muted)" }}>
                    {fmtDate(row.firstPrice)}
                  </td>
                  <td
                    className="px-4 py-3 text-xs font-mono font-semibold"
                    style={{ color: row.status === "stale" ? "#92400e" : "var(--wgi-text)" }}
                  >
                    {fmtDate(row.lastPrice)}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--wgi-text-muted)" }}>
                    {row.rows.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
