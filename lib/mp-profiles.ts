/** Shared risk-profile labels, colors, and URL slug helpers for model portfolio. */

export type MpProfileLabel = "A" | "B" | "C" | "C+" | "D" | "D+";

export const PROFILE_COLORS: Record<string, string> = {
  A:  "#10b981",
  B:  "#3b82f6",
  C:  "#f59e0b",
  "C+": "#f97316",
  D:  "#ef4444",
  "D+": "#dc2626",
};

export const PROFILE_META: Record<string, { color: string; bg: string; desc: string }> = {
  A:  { color: "#10b981", bg: "#ecfdf5", desc: "Conservative" },
  B:  { color: "#3b82f6", bg: "#eff6ff", desc: "Moderate" },
  C:  { color: "#f59e0b", bg: "#fffbeb", desc: "Moderate Aggressive" },
  "C+": { color: "#f97316", bg: "#fff7ed", desc: "Moderate Aggressive Plus" },
  D:  { color: "#ef4444", bg: "#fef2f2", desc: "Aggressive" },
  "D+": { color: "#dc2626", bg: "#fef2f2", desc: "Aggressive Plus" },
};

/** URL path segment for a profile label (handles C+, D+). */
export function profileToSlug(label: string): string {
  return encodeURIComponent(label.toLowerCase());
}

/** Parse profile label from a dynamic route segment. */
export function slugToProfileLabel(slug: string): string {
  return decodeURIComponent(slug).toUpperCase();
}

export function profileColor(label: string): string {
  return PROFILE_COLORS[label] ?? "#64748b";
}

export function profileMeta(label: string, fallbackName?: string) {
  return (
    PROFILE_META[label] ?? {
      color: "#64748b",
      bg: "#f8fafc",
      desc: fallbackName ?? label,
    }
  );
}
