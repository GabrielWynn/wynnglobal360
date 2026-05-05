"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { DailyChartPoint, PortfolioComposition } from "@/lib/portfolio-compositions";
import { getCompositionAtDate } from "@/lib/portfolio-compositions";

interface Props {
  series:       DailyChartPoint[];
  compositions: PortfolioComposition[];
  profileLabel: string;
  profileColor: string;
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
      <p style={{ color: payload[0].value >= 0 ? "#10b981" : "#ef4444" }}>
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
  const today = new Date().toISOString().slice(0, 10);
  const targetDate = date ?? today;
  const comp = getCompositionAtDate(compositions, targetDate);

  const sorted = comp
    ? [...comp.holdings].sort((a, b) => b.weight - a.weight)
    : [];

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "var(--wgi-border)" }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ background: "white", borderColor: "var(--wgi-border)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
          {date ? "Holdings as of" : "Current Holdings"}
        </p>
        {date && (
          <p className="text-sm font-semibold" style={{ color: "var(--wgi-accent)" }}>
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleClick(data: any) {
    if (data?.activeLabel && typeof data.activeLabel === "string") {
      setSelectedDate(data.activeLabel);
    }
  }

  const earliest = series[0]?.date;
  const latest   = series[series.length - 1]?.date;

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div
        className="rounded-2xl border p-5"
        style={{ background: "white", borderColor: "var(--wgi-border)" }}
      >
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--wgi-text)" }}>
              Cumulative Return — Perfil {profileLabel}
            </p>
            {earliest && latest && (
              <p className="text-[11px] mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
                {fmtDate(earliest)} → {fmtDate(latest)} · click any point to view holdings
              </p>
            )}
          </div>
          {selectedDate && (
            <button
              onClick={() => setSelectedDate(null)}
              className="text-xs px-3 py-1 rounded-lg border transition-colors hover:bg-slate-50 flex-shrink-0"
              style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text-muted)" }}
            >
              Reset to today
            </button>
          )}
        </div>

        {series.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
              No price data available yet. Run the price sync from the Admin panel.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={series}
              onClick={handleClick}
              style={{ cursor: "crosshair" }}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
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
              {selectedDate && (
                <ReferenceLine
                  x={selectedDate}
                  stroke={profileColor}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              )}
              <Line
                type="monotone"
                dataKey="portfolioReturn"
                stroke={profileColor}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: profileColor, strokeWidth: 0 }}
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
