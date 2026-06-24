"use client";

import type { AnnualReturn } from "@/lib/portfolio-compositions";

interface Props {
  returns: AnnualReturn[];
}

function bar(v: number): number {
  // Width as % of a reference of ±50% max display range
  return Math.min(Math.abs(v) / 0.5, 1) * 100;
}

export default function AnnualPerformance({ returns }: Props) {
  if (!returns.length) {
    return (
      <div
        className="rounded-2xl border p-8 text-center"
        style={{ background: "white", borderColor: "var(--wgi-border)" }}
      >
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--wgi-text)" }}>
          Annual Performance
        </p>
        <p className="text-xs" style={{ color: "var(--wgi-text-muted)" }}>
          Complete calendar-year returns will appear here once a full year of
          daily price data is available.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "var(--wgi-border)" }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 border-b mp-panel-header"
        style={{ background: "white", borderColor: "var(--wgi-border)" }}
      >
        <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>
          Annual Performance
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
          Calendar-year returns · partial years marked when the portfolio started mid-year · current year shown as YTD above
        </p>
      </div>

      {/* Rows */}
      <div className="divide-y" style={{ background: "white", borderColor: "var(--wgi-border)" }}>
        {[...returns].reverse().map(({ year, return: ret, partial, days }) => {
          const positive = ret >= 0;
          const pct      = `${positive ? "+" : ""}${(ret * 100).toFixed(2)}%`;
          const barColor = positive ? "var(--mp-gain, #00873E)" : "var(--mp-loss, #CC0000)";
          const w        = bar(ret);

          return (
            <div key={year} className="flex items-center gap-4 px-5 py-3.5">
              {/* Year */}
              <div className="w-24 flex-shrink-0">
                <span
                  className="text-sm font-bold block"
                  style={{ color: "var(--wgi-text)" }}
                >
                  {year}
                </span>
                {partial && (
                  <span className="text-[10px]" style={{ color: "var(--wgi-text-muted)" }}>
                    partial · {days}d
                  </span>
                )}
              </div>

              {/* Bar */}
              <div className="flex-1 h-5 rounded-full overflow-hidden flex items-center"
                   style={{ background: "var(--wgi-bg)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${w}%`, background: barColor, minWidth: "2px" }}
                />
              </div>

              {/* Value */}
              <span
                className="text-base font-bold w-20 text-right flex-shrink-0"
                style={{ color: barColor }}
              >
                {pct}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
