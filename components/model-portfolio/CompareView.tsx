"use client";

import { useState, useEffect, useCallback } from "react";
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
import { formatReturn, returnColor, type StandardReturns, type ChartPoint } from "@/lib/model-portfolio";
import { profileToSlug } from "@/lib/mp-profiles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Platform { id: string; name: string; slug: string }
interface Profile  { id: string; label: string; name: string }

interface PerformanceData {
  platform:       { name: string; slug: string };
  profile:        { label: string; name: string };
  standardReturns: StandardReturns;
  chartSeries:    ChartPoint[];
}

interface Props {
  platforms: Platform[];
  profiles:  Profile[];
}

// ---------------------------------------------------------------------------
// Merged chart data
// ---------------------------------------------------------------------------

interface MergedPoint {
  date:  string;
  left:  number | null;
  right: number | null;
}

function mergeSeries(left: ChartPoint[], right: ChartPoint[]): MergedPoint[] {
  const allDates = [...new Set([...left.map((p) => p.date), ...right.map((p) => p.date)])].sort();
  const leftMap  = new Map(left.map((p) => [p.date, p.portfolioReturn]));
  const rightMap = new Map(right.map((p) => [p.date, p.portfolioReturn]));
  return allDates.map((date) => ({
    date,
    left:  leftMap.get(date)  ?? null,
    right: rightMap.get(date) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function pct(v: number) {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

const PERIODS: Array<{ key: keyof StandardReturns; label: string }> = [
  { key: "1M",              label: "1M"   },
  { key: "3M",              label: "3M"   },
  { key: "6M",              label: "6M"   },
  { key: "YTD",             label: "YTD"  },
  { key: "1Y",              label: "1Y"   },
  { key: "2Y",              label: "2Y"   },
  { key: "Since Inception", label: "SI"   },
];

const LEFT_COLOR  = "#1B2D45"; // wgi-navy
const RIGHT_COLOR = "#2C4F7C"; // wgi-navy-500

// ---------------------------------------------------------------------------
// Side selector
// ---------------------------------------------------------------------------

function Selector({
  platforms,
  profiles,
  selectedPlatform,
  selectedProfile,
  onPlatformChange,
  onProfileChange,
  label,
  accentColor,
}: {
  platforms:        Platform[];
  profiles:         Profile[];
  selectedPlatform: string;
  selectedProfile:  string;
  onPlatformChange: (v: string) => void;
  onProfileChange:  (v: string) => void;
  label:            string;
  accentColor:      string;
}) {
  return (
    <div
      className="flex-1 rounded-2xl border p-4"
      style={{ background: "white", borderColor: "var(--wgi-border)", borderTopColor: accentColor, borderTopWidth: 3 }}
    >
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: accentColor }}>
        {label}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={selectedPlatform}
          onChange={(e) => onPlatformChange(e.target.value)}
          className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          <option value="">— Platform —</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.slug}>{p.name}</option>
          ))}
        </select>
        <select
          value={selectedProfile}
          onChange={(e) => onProfileChange(e.target.value)}
          className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none"
          style={{ borderColor: "var(--wgi-border)", color: "var(--wgi-text)" }}
        >
          <option value="">— Profile —</option>
          {profiles.map((p) => (
            <option key={p.id} value={profileToSlug(p.label)}>
              Perfil {p.label} — {p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary cards side-by-side
// ---------------------------------------------------------------------------

function SummaryRow({
  leftData,
  rightData,
}: {
  leftData:  PerformanceData | null;
  rightData: PerformanceData | null;
}) {
  if (!leftData && !rightData) return null;

  return (
    <div className="grid grid-cols-2 gap-4">
      {[
        { data: leftData,  color: LEFT_COLOR  },
        { data: rightData, color: RIGHT_COLOR },
      ].map(({ data, color }, idx) => (
        <div key={idx} className="space-y-2">
          {data && (
            <p className="text-xs font-semibold" style={{ color }}>
              {data.platform.name} / Perfil {data.profile.label}
            </p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {PERIODS.map(({ key, label }) => {
              const value = data?.standardReturns[key] ?? null;
              return (
                <div
                  key={key}
                  className="rounded-xl border p-2.5 text-center"
                  style={{ background: "white", borderColor: "var(--wgi-border)" }}
                >
                  <p className="text-[9px] font-semibold uppercase tracking-wider mb-0.5"
                     style={{ color: "var(--wgi-text-muted)" }}>
                    {label}
                  </p>
                  <p className="text-sm font-bold" style={{ color: data ? returnColor(value) : "#cbd5e1" }}>
                    {data ? formatReturn(value) : "—"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2 text-sm shadow-lg"
         style={{ background: "white", borderColor: "var(--wgi-border)" }}>
      <p className="font-semibold mb-1" style={{ color: "var(--wgi-text)" }}>
        {label ? formatDate(label) : ""}
      </p>
      {payload.map((e) => (
        <p key={e.name} style={{ color: e.color }}>
          {e.name}: {pct(e.value)}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CompareView({ platforms, profiles }: Props) {
  const [leftPlatform,  setLeftPlatform]  = useState("");
  const [leftProfile,   setLeftProfile]   = useState("");
  const [rightPlatform, setRightPlatform] = useState("");
  const [rightProfile,  setRightProfile]  = useState("");

  const [leftData,  setLeftData]  = useState<PerformanceData | null>(null);
  const [rightData, setRightData] = useState<PerformanceData | null>(null);
  const [loading,   setLoading]   = useState<"left" | "right" | null>(null);

  const fetchSide = useCallback(
    async (side: "left" | "right", platform: string, profile: string) => {
      if (!platform || !profile) {
        side === "left" ? setLeftData(null) : setRightData(null);
        return;
      }
      setLoading(side);
      try {
        const res = await fetch(
          `/api/model-portfolio/performance?platform=${encodeURIComponent(platform)}&profile=${encodeURIComponent(profile)}`
        );
        if (!res.ok) throw new Error("fetch failed");
        const data: PerformanceData = await res.json();
        side === "left" ? setLeftData(data) : setRightData(data);
      } catch {
        side === "left" ? setLeftData(null) : setRightData(null);
      } finally {
        setLoading(null);
      }
    },
    []
  );

  useEffect(() => { fetchSide("left",  leftPlatform,  leftProfile);  }, [leftPlatform,  leftProfile,  fetchSide]);
  useEffect(() => { fetchSide("right", rightPlatform, rightProfile); }, [rightPlatform, rightProfile, fetchSide]);

  const merged = leftData || rightData
    ? mergeSeries(leftData?.chartSeries ?? [], rightData?.chartSeries ?? [])
    : [];

  const leftName  = leftData  ? `${leftData.platform.name} / ${leftData.profile.label}`   : "Portfolio A";
  const rightName = rightData ? `${rightData.platform.name} / ${rightData.profile.label}` : "Portfolio B";

  return (
    <div className="space-y-5">
      {/* Selectors */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Selector
          platforms={platforms} profiles={profiles}
          selectedPlatform={leftPlatform}  selectedProfile={leftProfile}
          onPlatformChange={setLeftPlatform}  onProfileChange={setLeftProfile}
          label="Portfolio A" accentColor={LEFT_COLOR}
        />
        <Selector
          platforms={platforms} profiles={profiles}
          selectedPlatform={rightPlatform} selectedProfile={rightProfile}
          onPlatformChange={setRightPlatform} onProfileChange={setRightProfile}
          label="Portfolio B" accentColor={RIGHT_COLOR}
        />
      </div>

      {/* Loading indicator */}
      {loading && (
        <p className="text-sm text-center" style={{ color: "var(--wgi-text-muted)" }}>
          Loading {loading === "left" ? "Portfolio A" : "Portfolio B"}…
        </p>
      )}

      {/* Summary rows */}
      <SummaryRow leftData={leftData} rightData={rightData} />

      {/* Overlaid chart */}
      {merged.length > 0 && (
        <div
          className="rounded-2xl border p-5"
          style={{ background: "white", borderColor: "var(--wgi-border)" }}
        >
          <p className="text-sm font-semibold mb-5" style={{ color: "var(--wgi-text)" }}>
            Cumulative Return Comparison
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={merged} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={formatDate}
                     tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                     tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
              {leftData && (
                <Line type="monotone" dataKey="left" name={leftName}
                      stroke={LEFT_COLOR} strokeWidth={2.5} dot={false}
                      activeDot={{ r: 4 }} connectNulls />
              )}
              {rightData && (
                <Line type="monotone" dataKey="right" name={rightName}
                      stroke={RIGHT_COLOR} strokeWidth={2.5} dot={false}
                      strokeDasharray="5 3" activeDot={{ r: 4 }} connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Empty state */}
      {!leftData && !rightData && !loading && (
        <div
          className="rounded-2xl border p-12 text-center"
          style={{ background: "white", borderColor: "var(--wgi-border)" }}
        >
          <p className="text-sm" style={{ color: "var(--wgi-text-muted)" }}>
            Select a platform and profile on each side to compare performance.
          </p>
        </div>
      )}
    </div>
  );
}
