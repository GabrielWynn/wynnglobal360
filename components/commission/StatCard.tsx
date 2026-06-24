import { cn } from "@/lib/utils";

/**
 * Commission dashboard stat card.
 *
 * One cell of the dashboard stat strip (DESIGN-COMMISSION.md). Variants add a
 * colored left border + value tint to flag attention states. Monetary values
 * render in JetBrains Mono with tabular figures via `--font-jetbrains-mono`
 * (loaded in app/commission/layout.tsx).
 *
 * Phase 1: component only. Not yet wired into any page.
 */

type StatVariant = "default" | "warning" | "alert";

const BORDER_CLASSES: Record<StatVariant, string> = {
  default: "",
  warning: "border-l-[3px] border-l-[var(--cm-alert-warning-border)]",
  alert: "border-l-[3px] border-l-[var(--cm-alert-critical-border)]",
};

const VALUE_COLOR: Record<StatVariant, string> = {
  default: "text-[var(--wgi-navy)]",
  warning: "text-[var(--cm-alert-warning-text)]",
  alert: "text-[var(--cm-alert-critical-text)]",
};

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Optional sub-line below the value. */
  sub?: React.ReactNode;
  variant?: StatVariant;
  /** Render the value in JetBrains Mono with tabular figures (for currency). */
  mono?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  sub,
  variant = "default",
  mono = false,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "px-6 py-4",
        BORDER_CLASSES[variant],
        className,
      )}
    >
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--wgi-text-muted)]">
        {label}
      </div>
      <div
        className={cn(
          "mb-0.5 font-bold leading-tight",
          VALUE_COLOR[variant],
          mono ? "text-[18px] tabular-nums" : "text-[22px]",
        )}
        style={mono ? { fontFamily: "var(--font-jetbrains-mono)" } : undefined}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] font-medium text-[var(--wgi-text-light)]">
          {sub}
        </div>
      )}
    </div>
  );
}

export default StatCard;
