"use client";

import { formatReturn, returnColor, type StandardReturns } from "@/lib/model-portfolio";

interface Props {
  returns: StandardReturns;
}

const PERIODS: Array<{ key: keyof StandardReturns; label: string }> = [
  { key: "1M",              label: "1 Month"        },
  { key: "3M",              label: "3 Months"       },
  { key: "6M",              label: "6 Months"       },
  { key: "YTD",             label: "YTD"            },
  { key: "1Y",              label: "1 Year"         },
  { key: "2Y",              label: "2 Years"        },
  { key: "Since Inception", label: "Since Inception"},
];

export default function PerformanceSummaryCards({ returns }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {PERIODS.map(({ key, label }) => {
        const value = returns[key];
        const color = returnColor(value);

        return (
          <div
            key={key}
            className="rounded-xl border p-3 flex flex-col gap-1"
            style={{ background: "white", borderColor: "var(--wgi-border)" }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--wgi-text-muted)" }}
            >
              {label}
            </p>
            <p
              className="text-lg font-bold leading-tight"
              style={{ color }}
            >
              {formatReturn(value)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
