"use client";

import type { StandardReturns } from "@/lib/portfolio-compositions";

interface Props {
  returns: StandardReturns;
}

function fmt(value: number | null): string {
  if (value === null) return "—";
  const pct = (value * 100).toFixed(2);
  return value >= 0 ? `+${pct}%` : `${pct}%`;
}

function color(value: number | null): string {
  if (value === null) return "var(--wgi-text-muted)";
  return value >= 0 ? "#10b981" : "#ef4444";
}

const PERIODS: Array<{ key: keyof StandardReturns; label: string }> = [
  { key: "1M",  label: "1 Month"  },
  { key: "3M",  label: "3 Months" },
  { key: "6M",  label: "6 Months" },
  { key: "YTD", label: "YTD"      },
];

export default function PerformanceSummaryCards({ returns }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {PERIODS.map(({ key, label }) => {
        const value = returns[key];
        return (
          <div
            key={key}
            className="rounded-xl border p-4 flex flex-col gap-1"
            style={{ background: "white", borderColor: "var(--wgi-border)" }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--wgi-text-muted)" }}
            >
              {label}
            </p>
            <p className="text-2xl font-bold" style={{ color: color(value) }}>
              {fmt(value)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
