import { cn } from "@/lib/utils";

/**
 * Commission alert banner.
 *
 * Non-blocking status strip shown below the commission nav (DESIGN-COMMISSION.md).
 * Two levels: `warning` (e.g. negative-balance IFAs) and `critical`
 * (e.g. unmapped policies blocking payout). Colors come from `--cm-alert-*`.
 *
 * Phase 1: component only. Not yet wired into any page.
 */

type AlertLevel = "warning" | "critical";

const LEVEL_CLASSES: Record<AlertLevel, string> = {
  warning:
    "bg-[var(--cm-alert-warning-bg)] border-[var(--cm-alert-warning-border)] text-[var(--cm-alert-warning-text)]",
  critical:
    "bg-[var(--cm-alert-critical-bg)] border-[var(--cm-alert-critical-border)] text-[var(--cm-alert-critical-text)]",
};

const LEVEL_ICON: Record<AlertLevel, string> = {
  warning: "!",
  critical: "⚠", // ⚠
};

export interface AlertBannerProps {
  level: AlertLevel;
  children: React.ReactNode;
  /** Optional call-to-action button label. */
  cta?: string;
  /** Click handler for the CTA button. */
  onCta?: () => void;
  /** When provided, renders a dismiss (×) button on the far right. */
  onDismiss?: () => void;
  className?: string;
}

export function AlertBanner({
  level,
  children,
  cta,
  onCta,
  onDismiss,
  className,
}: AlertBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b px-6 py-2.5 text-xs font-semibold",
        LEVEL_CLASSES[level],
        className,
      )}
    >
      <span aria-hidden className="text-sm leading-none">
        {LEVEL_ICON[level]}
      </span>
      <span>{children}</span>
      {cta && (
        <button
          type="button"
          onClick={onCta}
          className="ml-auto rounded border border-current px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-current/10"
        >
          {cta}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className={cn(
            "text-lg leading-none opacity-60 transition-opacity hover:opacity-100",
            !cta && "ml-auto",
          )}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default AlertBanner;
