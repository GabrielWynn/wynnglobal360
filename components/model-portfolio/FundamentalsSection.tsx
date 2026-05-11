"use client";

import type { PortfolioFundamentals, TopHolding } from "@/lib/portfolio-fundamentals";

// ---------------------------------------------------------------------------
// Color tokens per section
// ---------------------------------------------------------------------------

const COLORS = {
  asset:   "#0d9488",  // teal
  region:  "#3b82f6",  // blue
  sector:  "#7c3aed",  // violet
  country: "#d97706",  // amber
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "var(--wgi-border)" }}
    >
      <div
        className="px-5 py-4 border-b"
        style={{ background: "white", borderColor: "var(--wgi-border)" }}
      >
        <p className="text-base font-bold" style={{ color: "var(--wgi-text)" }}>
          {title}
        </p>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      <div style={{ background: "white" }}>{children}</div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max:   number;
  color: string;
}) {
  const w = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  return (
    <div className="flex items-center gap-3 px-5 py-2.5">
      <span
        className="text-sm w-40 flex-shrink-0 truncate"
        style={{ color: "var(--wgi-text)" }}
        title={label}
      >
        {label}
      </span>
      <div
        className="flex-1 h-4 rounded-full overflow-hidden"
        style={{ background: "var(--wgi-bg)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${w}%`, background: color, minWidth: "2px" }}
        />
      </div>
      <span
        className="text-sm font-bold w-14 text-right flex-shrink-0"
        style={{ color }}
      >
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

function EmptyCard({ title }: { title: string }) {
  return (
    <SectionCard title={title}>
      <p className="px-5 py-6 text-sm" style={{ color: "var(--wgi-text-muted)" }}>
        No data available
      </p>
    </SectionCard>
  );
}

function BarSection({
  title,
  subtitle,
  items,
  color,
  limit,
}: {
  title:    string;
  subtitle?: string;
  items:    Array<{ label: string; value: number }>;
  color:    string;
  limit?:   number;
}) {
  const visible = limit ? items.slice(0, limit) : items;
  if (!visible.length) return <EmptyCard title={title} />;
  const max = visible[0]?.value ?? 100;

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="divide-y" style={{ borderColor: "var(--wgi-border)" }}>
        {visible.map(({ label, value }) => (
          <BarRow key={label} label={label} value={value} max={max} color={color} />
        ))}
      </div>
    </SectionCard>
  );
}

function HoldingsTable({ holdings }: { holdings: TopHolding[] }) {
  if (!holdings.length) return null;
  return (
    <SectionCard title="Top Holdings" subtitle="Weighted across portfolio funds">
      <div className="divide-y" style={{ borderColor: "var(--wgi-border)" }}>
        {/* Column header */}
        <div
          className="grid px-5 py-2 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            gridTemplateColumns: "2rem 1fr 1fr 6rem 4rem",
            color: "var(--wgi-text-muted)",
          }}
        >
          <span>#</span>
          <span>Name</span>
          <span>Sector</span>
          <span>Country</span>
          <span className="text-right">Weight</span>
        </div>

        {holdings.map((h) => (
          <div
            key={h.rank}
            className="grid items-center px-5 py-3 text-sm"
            style={{ gridTemplateColumns: "2rem 1fr 1fr 6rem 4rem" }}
          >
            <span
              className="text-xs font-bold"
              style={{ color: "var(--wgi-text-muted)" }}
            >
              {h.rank}
            </span>
            <span
              className="font-medium truncate pr-2"
              style={{ color: "var(--wgi-text)" }}
              title={h.name}
            >
              {h.name}
            </span>
            <span
              className="text-xs truncate pr-2"
              style={{ color: "var(--wgi-text-muted)" }}
            >
              {h.sector ?? "—"}
            </span>
            <span
              className="text-xs truncate"
              style={{ color: "var(--wgi-text-muted)" }}
            >
              {h.country ?? "—"}
            </span>
            <span
              className="text-xs font-bold text-right"
              style={{ color: "var(--wgi-text)" }}
            >
              {h.weight_pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface Props {
  data: PortfolioFundamentals;
}

export default function FundamentalsSection({ data }: Props) {
  return (
    <div className="space-y-4">
      {/* Section header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--wgi-text)" }}>
          Portfolio Look-Through
        </h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--wgi-text-muted)" }}>
          Weighted breakdown of the current holdings
          {data.coverage < 100 && ` · ${data.coverage}% of portfolio covered`}
          {data.dataAsOf && ` · data as of ${data.dataAsOf}`}
        </p>
      </div>

      {/* Row 1: Asset Allocation + World Regions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BarSection
          title="Asset Allocation"
          items={data.assetAllocation}
          color={COLORS.asset}
        />
        <BarSection
          title="World Regions"
          items={data.worldRegions}
          color={COLORS.region}
        />
      </div>

      {/* Row 2: Stock Sectors + Country Exposure */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BarSection
          title="Stock Sectors"
          subtitle="Equity portfolio weight"
          items={data.sectorWeights}
          color={COLORS.sector}
        />
        <BarSection
          title="Country Exposure"
          subtitle="Top 15 by allocation"
          items={data.countryExposure}
          color={COLORS.country}
          limit={15}
        />
      </div>

      {/* Row 3: Top Holdings (full width) */}
      <HoldingsTable holdings={data.topHoldings} />
    </div>
  );
}
