"use client";

import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Brush,
} from "recharts";
import type { DailyChartPoint, PortfolioComposition } from "@/lib/portfolio-compositions";
import { getCompositionAtDate, getCurrentComposition } from "@/lib/portfolio-compositions";

interface Props {
  series:       DailyChartPoint[];
  compositions: PortfolioComposition[];
  profileLabel: string;
  profileColor: string;
}

type RangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "MAX";

const RANGE_OPTIONS: RangeKey[] = ["1M", "3M", "6M", "YTD", "1Y", "MAX"];

/** First index of `series` whose date falls inside the requested range. */
function startIndexForRange(series: DailyChartPoint[], range: RangeKey): number {
  if (range === "MAX" || series.length === 0) return 0;

  const last = new Date(`${series[series.length - 1].date}T00:00:00Z`);
  let cutoff: Date;

  if (range === "YTD") {
    cutoff = new Date(Date.UTC(last.getUTCFullYear(), 0, 1));
  } else {
    const months = range === "1M" ? 1 : range === "3M" ? 3 : range === "6M" ? 6 : 12;
    cutoff = new Date(last);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  }

  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const idx = series.findIndex((p) => p.date >= cutoffStr);
  return idx < 0 ? 0 : idx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-lg"
      style={{ background: "white", borderColor: "var(--wgi-border)" }}
    >
      <p className="font-semibold mb-1" style={{ color: "var(--wgi-text)" }}>
        {fmtDate(label)}
      </p>
      <p style={{ color: payload[0].value >= 0 ? "var(--mp-gain, #00873E)" : "var(--mp-loss, #CC0000)" }}>
        {fmtPct(payload[0].value)}
      </p>
      <p className="mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
        Click to view holdings
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Holdings table for a given date
// ---------------------------------------------------------------------------

function HoldingsAtDate({
  compositions,
  date,
}: {
  compositions: PortfolioComposition[];
  date: string | null;
}) {
  const comp = date
    ? getCompositionAtDate(compositions, date)
    : getCurrentComposition(compositions);

  const sorted = comp
    ? [...comp.holdings].sort((a, b) => b.weight - a.weight)
    : [];

  return (
    <div
      className="rounded-2xl border overflow-hidden mp-holdings-table"
      style={{ borderColor: "var(--wgi-border)" }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between mp-panel-header"
        style={{ background: "white", borderColor: "var(--wgi-border)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
          {date ? "Holdings as of" : "Current Holdings"}
        </p>
        {date && (
          <p className="text-sm font-semibold" style={{ color: "var(--wgi-navy)" }}>
            {fmtDate(date)}
          </p>
        )}
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div
          className="px-5 py-8 text-center text-sm"
          style={{ background: "white", color: "var(--wgi-text-muted)" }}
        >
          No composition data for this date
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ background: "white" }}>
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-left"
                style={{ borderColor: "var(--wgi-border)" }}
              >
                {["Fund", "ISIN", "Weight"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider ${i === 2 ? "text-right" : ""}`}
                    style={{ color: "var(--wgi-text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((h, idx) => (
                <tr
                  key={h.fundId}
                  className="border-b hover:bg-slate-50 transition-colors"
                  style={{
                    borderColor: "var(--wgi-border)",
                    background: idx % 2 === 0 ? "white" : "#fafafa",
                  }}
                >
                  <td className="px-5 py-3 font-medium" style={{ color: "var(--wgi-text)" }}>
                    {h.fundName}
                  </td>
                  <td
                    className="px-5 py-3 font-mono text-xs"
                    style={{ color: "var(--wgi-text-muted)" }}
                  >
                    {h.isin}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Mini bar */}
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${Math.min(h.weight * 100, 100) * 0.6}px`,
                          background: "var(--wgi-navy)",
                          minWidth: "4px",
                        }}
                      />
                      <span className="font-semibold text-sm" style={{ color: "var(--wgi-text)" }}>
                        {(h.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--wgi-bg)" }}>
                <td
                  colSpan={2}
                  className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--wgi-text-muted)" }}
                >
                  Total
                </td>
                <td
                  className="px-5 py-2.5 text-right text-sm font-bold"
                  style={{ color: "var(--wgi-text)" }}
                >
                  {(sorted.reduce((s, h) => s + h.weight, 0) * 100).toFixed(0)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InteractiveChart({
  series,
  compositions,
  profileLabel,
  profileColor,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey | null>("MAX");
  const [view, setView] = useState<{ start: number; end: number }>(() => ({
    start: 0,
    end: Math.max(series.length - 1, 0),
  }));

  const lastIdx = Math.max(series.length - 1, 0);
  const start = Math.min(view.start, lastIdx);
  const end   = Math.min(Math.max(view.end, start), lastIdx);

  // Rebase the whole series so the cumulative return reads 0% at the window
  // start (answers "how did it perform over the selected period?").
  const data = useMemo(() => {
    const base = series[start]?.portfolioReturn ?? 0;
    return series.map((p) => ({
      date: p.date,
      value: (1 + p.portfolioReturn) / (1 + base) - 1,
    }));
  }, [series, start]);

  // Y-axis autoscale to the visible window only.
  const yDomain = useMemo<[number, number]>(() => {
    const vals = data.slice(start, end + 1).map((d) => d.value);
    if (!vals.length) return [-0.01, 0.01];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.12 || 0.01;
    return [min - pad, max + pad];
  }, [data, start, end]);

  const periodReturn = data[end]?.value ?? 0;
  const windowStartDate = series[start]?.date;
  const windowEndDate   = series[end]?.date;

  function applyRange(r: RangeKey) {
    setRange(r);
    setView({ start: startIndexForRange(series, r), end: lastIdx });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleClick(d: any) {
    if (d?.activeLabel && typeof d.activeLabel === "string") {
      setSelectedDate(d.activeLabel);
    }
  }

  function handleBrush(r: { startIndex?: number; endIndex?: number }) {
    if (typeof r.startIndex === "number" && typeof r.endIndex === "number") {
      setView({ start: r.startIndex, end: r.endIndex });
      setRange(null); // custom window — no preset is "active"
    }
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div
        className="rounded-2xl border p-5"
        style={{ background: "white", borderColor: "var(--wgi-border)" }}
      >
        <div className="flex flex-wrap items-start justify-between mb-4 gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
              Cumulative Return — Perfil {profileLabel}
            </p>
            {windowStartDate && windowEndDate && (
              <p className="text-[11px] mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
                {fmtDate(windowStartDate)} → {fmtDate(windowEndDate)} ·{" "}
                <span style={{ color: periodReturn >= 0 ? "var(--mp-gain, #00873E)" : "var(--mp-loss, #CC0000)", fontWeight: 600 }}>
                  {fmtPct(periodReturn)}
                </span>{" "}
                over period · drag the timeline or click a point for holdings
              </p>
            )}
          </div>

          {/* Range presets */}
          {series.length > 1 && (
            <div className="flex rounded-lg border overflow-hidden flex-shrink-0 mp-range-group" style={{ borderColor: "var(--wgi-border)" }}>
              {RANGE_OPTIONS.map((r, i) => {
                const active = range === r;
                return (
                  <button
                    key={r}
                    onClick={() => applyRange(r)}
                    className={`px-2.5 py-1 text-[11px] font-semibold transition-colors${active ? " mp-range-active" : ""}`}
                    style={{
                      background:  active ? "var(--mp-gold-bg, #FBF7F0)" : "white",
                      color:       active ? "var(--wgi-navy)" : "var(--wgi-text-muted)",
                      borderRight: i < RANGE_OPTIONS.length - 1 ? "1px solid var(--wgi-border)" : undefined,
                      boxShadow:   active ? "inset 0 0 0 1px var(--wgi-gold)" : undefined,
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {series.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
              No price data available yet. Run the price sync from the Admin panel.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={data}
              onClick={handleClick}
              style={{ cursor: "crosshair" }}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                width={48}
                allowDataOverflow
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
              {selectedDate && (
                <ReferenceLine
                  x={selectedDate}
                  stroke="var(--wgi-navy)"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--wgi-navy)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: "var(--wgi-navy)", strokeWidth: 0 }}
              />
              <Brush
                dataKey="date"
                height={26}
                travellerWidth={10}
                stroke="var(--wgi-navy)"
                fill="#f4f4f5"
                tickFormatter={fmtDate}
                startIndex={start}
                endIndex={end}
                onChange={handleBrush}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Holdings at selected date */}
      <HoldingsAtDate compositions={compositions} date={selectedDate} />
    </div>
  );
}
