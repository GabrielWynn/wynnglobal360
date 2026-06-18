/** Shared risk-profile labels, colors, and URL slug helpers for model portfolio. */

export type MpProfileLabel = "A" | "B" | "C" | "C+" | "D" | "D+";

export const PROFILE_COLORS: Record<string, string> = {
  A:  "#3D5A73",
  B:  "#4A6882",
  C:  "#5E7A94",
  "C+": "#8A9AAD",
  D:  "#A89872",
  "D+": "#C8A96E",
};

export const PROFILE_META: Record<string, { color: string; bg: string; desc: string }> = {
  A:  { color: "#1B2D45", bg: "#EEF2F6", desc: "Conservative" },
  B:  { color: "#1B2D45", bg: "#E8EDF3", desc: "Moderate" },
  C:  { color: "#1B2D45", bg: "#F0F3F6", desc: "Moderate Aggressive" },
  "C+": { color: "#1B2D45", bg: "#F5F0E6", desc: "Moderate Aggressive Plus" },
  D:  { color: "#1B2D45", bg: "#FBF7F0", desc: "Aggressive" },
  "D+": { color: "#1B2D45", bg: "#F5EDD8", desc: "Aggressive Plus" },
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
