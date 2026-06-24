import { cn } from "@/lib/utils";

/**
 * Commission status badge.
 *
 * Renders against the `--cm-status-*` design tokens (DESIGN-COMMISSION.md).
 * Uses scoped arbitrary-value classes so it never collides with the legacy
 * global `.badge-*` utility classes defined in globals.css.
 *
 * Phase 1: component only. Not yet wired into any page.
 */

type StatusKey =
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "suspended"
  | "advance"
  | "unmapped";

const STATUS_CLASSES: Record<StatusKey, string> = {
  pending:   "bg-[var(--cm-status-pending-bg)]   text-[var(--cm-status-pending-text)]",
  approved:  "bg-[var(--cm-status-approved-bg)]  text-[var(--cm-status-approved-text)]",
  rejected:  "bg-[var(--cm-status-rejected-bg)]  text-[var(--cm-status-rejected-text)]",
  paid:      "bg-[var(--cm-status-paid-bg)]      text-[var(--cm-status-paid-text)]",
  suspended: "bg-[var(--cm-status-suspended-bg)] text-[var(--cm-status-suspended-text)]",
  advance:   "bg-[var(--cm-status-advance-bg)]   text-[var(--cm-status-advance-text)]",
  // "unmapped" is a rejected-state variant: shares the rejected palette.
  unmapped:  "bg-[var(--cm-status-rejected-bg)]  text-[var(--cm-status-rejected-text)]",
};

const FALLBACK_CLASS = "bg-slate-100 text-slate-700";

function normalize(status: string): StatusKey | null {
  const key = status.toLowerCase().replace(/[^a-z]/g, "") as StatusKey;
  return key in STATUS_CLASSES ? key : null;
}

export interface StatusBadgeProps {
  /** Status string, e.g. "Approved", "pending", "Unmapped". Case-insensitive. */
  status: string;
  /** Optional override label. Defaults to the `status` value. */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const key = normalize(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] px-2 py-0.5",
        "text-[10px] font-bold uppercase tracking-[0.06em] whitespace-nowrap",
        key ? STATUS_CLASSES[key] : FALLBACK_CLASS,
        className,
      )}
    >
      {label ?? status}
    </span>
  );
}

export default StatusBadge;
