"use client";

import type { TrailingKey, TrailingReturns } from "@/lib/portfolio-compositions";

interface Props {
  returns: TrailingReturns;
}

function fmt(value: number): string {
  const pct = (value * 100).toFixed(2);
  return value >= 0 ? `+${pct}%` : `${pct}%`;
}

function color(value: number | null): string {
  if (value === null) return "var(--wgi-text-muted)";
  return value >= 0 ? "var(--mp-gain, #00873E)" : "var(--mp-loss, #CC0000)";
}

const PERIODS: Array<{ key: TrailingKey; label: string }> = [
  { key: "1Y", label: "1 Year"  },
  { key: "2Y", label: "2 Years" },
  { key: "3Y", label: "3 Years" },
  { key: "5Y", label: "5 Years" },
];

export default function AnnualisedPerformance({ returns }: Props) {
  return (
    <div
      className="rounded-2xl border overflow-hidden mp-print-block"
      style={{ borderColor: "var(--wgi-border)" }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 border-b mp-panel-header"
        style={{ background: "white", borderColor: "var(--wgi-border)" }}
      >
        <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>
          Annualised Performance
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
          Trailing periods · compound annual return (p.a.) · total return for the period shown below · — when the portfolio has less history than the period
        </p>
      </div>

      {/* Cells — 1px gaps over the border colour draw the dividers */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-px"
        style={{ background: "var(--wgi-border)" }}
      >
        {PERIODS.map(({ key, label }) => {
          const value = returns[key];
          return (
            <div key={key} className="p-4 flex flex-col gap-1" style={{ background: "white" }}>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--wgi-text-muted)" }}
              >
                {label}
              </p>
              <p
                className="text-2xl font-bold tabular-nums"
                style={{ color: color(value?.annualised ?? null) }}
              >
                {value ? fmt(value.annualised) : "—"}
                {value && (
                  <span className="text-xs font-semibold ml-1" style={{ color: "var(--wgi-text-muted)" }}>
                    p.a.
                  </span>
                )}
              </p>
              <p className="text-[11px] tabular-nums" style={{ color: "var(--wgi-text-muted)" }}>
                {value ? `Total ${fmt(value.cumulative)}` : "Not enough history"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
