"use client";

import Link from "next/link";
import { formatReturn, returnColor, type HoldingRow } from "@/lib/model-portfolio";

interface Props {
  holdings:    HoldingRow[];
  periodLabel: string;
}

export default function HoldingsTable({ holdings, periodLabel }: Props) {
  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "var(--wgi-border)" }}
    >
      {/* Table header */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{
          background: "white",
          borderColor: "var(--wgi-border)",
        }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
          Current Holdings
        </p>
        <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
          {periodLabel}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ background: "white" }}>
          <thead>
            <tr
              className="border-b text-left"
              style={{ borderColor: "var(--wgi-border)" }}
            >
              {[
                ["Fund", "w-[38%]"],
                ["ISIN", "w-[14%]"],
                ["Weight", "w-[10%] text-right"],
                ["Initial Price", "w-[12%] text-right"],
                ["Final Price", "w-[12%] text-right"],
                ["Return", "w-[7%] text-right"],
                ["Contribution", "w-[7%] text-right"],
              ].map(([label, cls]) => (
                <th
                  key={label}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider ${cls}`}
                  style={{ color: "var(--wgi-text-muted)" }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sorted.map((h, idx) => (
              <tr
                key={h.fundId}
                className="border-b transition-colors hover:bg-slate-50"
                style={{
                  borderColor: "var(--wgi-border)",
                  background: idx % 2 === 0 ? "white" : "#fafafa",
                }}
              >
                {/* Fund name — links to drill-down */}
                <td className="px-4 py-3">
                  <Link
                    href={`/model-portfolio/funds/${h.isin}`}
                    className="font-medium text-sm leading-tight hover:underline"
                    style={{ color: "var(--wgi-text)" }}
                  >
                    {h.fundName}
                  </Link>
                </td>

                {/* ISIN */}
                <td className="px-4 py-3">
                  <span
                    className="font-mono text-xs px-1.5 py-0.5 rounded"
                    style={{
                      color: "var(--wgi-text-muted)",
                      background: "var(--wgi-bg)",
                    }}
                  >
                    {h.isin}
                  </span>
                </td>

                {/* Weight */}
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-semibold text-sm" style={{ color: "var(--wgi-text)" }}>
                      {(h.weight * 100).toFixed(0)}%
                    </span>
                    <div
                      className="h-1 rounded-full"
                      style={{
                        width: `${Math.min(h.weight * 100, 100)}%`,
                        background: "var(--wgi-navy)",
                        minWidth: "4px",
                        maxWidth: "48px",
                      }}
                    />
                  </div>
                </td>

                {/* Initial price */}
                <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "var(--wgi-text)" }}>
                  {h.initialPrice !== null ? h.initialPrice.toFixed(2) : "—"}
                </td>

                {/* Final price */}
                <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "var(--wgi-text)" }}>
                  {h.finalPrice !== null ? (
                    h.finalPrice.toFixed(2)
                  ) : (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{ background: "#fef3c7", color: "#92400e" }}
                    >
                      Open
                    </span>
                  )}
                </td>

                {/* Return */}
                <td
                  className="px-4 py-3 text-right font-semibold text-sm"
                  style={{ color: returnColor(h.returnPct) }}
                >
                  {formatReturn(h.returnPct)}
                </td>

                {/* Weighted return */}
                <td
                  className="px-4 py-3 text-right font-semibold text-sm"
                  style={{ color: returnColor(h.weightedReturn) }}
                >
                  {formatReturn(h.weightedReturn)}
                </td>
              </tr>
            ))}
          </tbody>

          {/* Totals row */}
          <tfoot>
            <tr style={{ background: "var(--wgi-bg)" }}>
              <td
                colSpan={2}
                className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--wgi-text-muted)" }}
              >
                Portfolio Total
              </td>
              <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: "var(--wgi-text)" }}>
                {(sorted.reduce((s, h) => s + h.weight, 0) * 100).toFixed(0)}%
              </td>
              <td colSpan={3} />
              <td
                className="px-4 py-2.5 text-right text-sm font-bold"
                style={{
                  color: returnColor(
                    sorted.reduce((s, h) => s + (h.weightedReturn ?? 0), 0)
                  ),
                }}
              >
                {formatReturn(
                  sorted.reduce((s, h) => s + (h.weightedReturn ?? 0), 0)
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
