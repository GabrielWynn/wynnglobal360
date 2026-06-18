"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ChartPoint } from "@/lib/model-portfolio";
import type { DailyChartPoint } from "@/lib/analytics";

interface BenchmarkOption {
  id:   string;
  name: string;
}

interface Props {
  series:           ChartPoint[] | DailyChartPoint[];  // period-level (full history)
  dailySeries?:     DailyChartPoint[] | null;          // daily (recent window)
  dailyEarliestDate?: string | null;
  dailyLatestDate?:   string | null;
  profileLabel:     string;
  benchmarks:       BenchmarkOption[];
  benchmarkPriceMap: Record<string, Array<{ date: string; price: number }>>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function pct(v: number) {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

// Merge benchmark prices into chart series so each point has both portfolio
// and benchmark cumulative return.
function mergeWithBenchmark(
  series: ChartPoint[] | DailyChartPoint[],
  benchPrices: Array<{ date: string; price: number }>
): (ChartPoint | DailyChartPoint)[] {
  if (!benchPrices.length || !series.length) return series;

  const priceMap = new Map(benchPrices.map((b) => [b.date, b.price]));

  // Find start price nearest to first period start date
  // Use the first benchmark price that is <= first series date
  const firstDate = series[0]?.date;
  if (!firstDate) return series;

  // Sort benchmark prices ascending and find the one closest to firstDate
  const sorted = [...benchPrices].sort((a, b) => a.date.localeCompare(b.date));
  const startEntry = sorted.find((b) => b.date <= firstDate) ?? sorted[0];
  const startPrice = startEntry?.price;

  if (!startPrice) return series;

  return series.map((point) => {
    // Find nearest benchmark price on or before point.date
    let endPrice: number | null = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].date <= point.date) {
        endPrice = sorted[i].price;
        break;
      }
    }
    return {
      ...point,
      benchmarkReturn: endPrice !== null ? endPrice / startPrice - 1 : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm shadow-lg"
      style={{ background: "white", borderColor: "var(--wgi-border)" }}
    >
      <p
        className="font-semibold mb-1"
        style={{ color: "var(--wgi-text)" }}
      >
        {label ? formatDate(label) : ""}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {pct(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PerformanceChart({
  series,
  dailySeries,
  dailyEarliestDate,
  dailyLatestDate,
  profileLabel,
  benchmarks,
  benchmarkPriceMap,
}: Props) {
  const [selectedBenchmark, setSelectedBenchmark] = useState<string>("none");
  const hasDailyData = !!dailySeries?.length;
  // Default to daily view when data is available — it's the most current
  const [viewMode, setViewMode] = useState<"period" | "daily">(
    hasDailyData ? "daily" : "period"
  );
  const activeSeries = viewMode === "daily" && hasDailyData ? dailySeries! : series;

  const benchPrices =
    selectedBenchmark !== "none"
      ? (benchmarkPriceMap[selectedBenchmark] ?? [])
      : [];

  const chartData = mergeWithBenchmark(activeSeries, benchPrices);
  const hasBenchmarkData =
    selectedBenchmark !== "none" && benchPrices.length > 0;
  const benchmarkName =
    benchmarks.find((b) => b.id === selectedBenchmark)?.name ?? "";

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: "white", borderColor: "var(--wgi-border)" }}
    >
      {/* Chart header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
            Cumulative Return — Perfil {profileLabel}
          </p>
          {viewMode === "daily" && dailyEarliestDate && dailyLatestDate && (
            <p className="text-[11px] mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
              Daily prices · {dailyEarliestDate} → {dailyLatestDate}
            </p>
          )}
          {viewMode === "period" && (
            <p className="text-[11px] mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
              Full history · one point per period
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Period / Daily toggle */}
          {hasDailyData && (
            <div className="flex rounded-lg border overflow-hidden text-[11px] font-semibold"
                 style={{ borderColor: "var(--wgi-border)" }}>
              {(["period", "daily"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className="px-3 py-1.5 capitalize transition-colors"
                  style={{
                    background: viewMode === mode ? "var(--wgi-navy)" : "white",
                    color:      viewMode === mode ? "white" : "var(--wgi-text-muted)",
                    borderRight: mode === "period" ? "1px solid var(--wgi-border)" : undefined,
                  }}
                >
                  {mode === "period" ? "Full history" : "Daily"}
                </button>
              ))}
            </div>
          )}

        {/* Benchmark selector */}
        <div className="flex items-center gap-2">
          <label
            className="text-xs"
            style={{ color: "var(--wgi-text-muted)" }}
          >
            Benchmark:
          </label>
          <select
            value={selectedBenchmark}
            onChange={(e) => setSelectedBenchmark(e.target.value)}
            className="text-xs border rounded-lg px-2 py-1 focus:outline-none"
            style={{
              borderColor: "var(--wgi-border)",
              color: "var(--wgi-text)",
            }}
          >
            <option value="none">None</option>
            {benchmarks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        </div> {/* end right controls */}
      </div>

      {selectedBenchmark !== "none" && !hasBenchmarkData && (
        <p
          className="text-xs mb-3 px-3 py-2 rounded-lg"
          style={{
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #fde68a",
          }}
        >
          No historical data for this benchmark yet. Run the price sync from the
          admin panel to populate it.
        </p>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
          />
          <Line
            type="monotone"
            dataKey="portfolioReturn"
            name={`Perfil ${profileLabel}`}
            stroke="#1B2D45"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
          {hasBenchmarkData && (
            <Line
              type="monotone"
              dataKey="benchmarkReturn"
              name={benchmarkName}
              stroke="var(--mp-loss, #CC0000)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 3 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
