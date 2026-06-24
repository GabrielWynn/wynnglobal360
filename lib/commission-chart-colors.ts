/**
 * Commission chart palette (DESIGN-COMMISSION.md).
 *
 * Replaces the legacy rainbow array. Desaturated navy/gold/slate tones that
 * read as a coherent finance data visualization rather than a default palette.
 * Values are CSS variables resolved from globals.css `--cm-chart-*`; recharts
 * accepts them directly as SVG `fill` / `stroke`.
 */
export const CM_CHART_COLORS = [
  "var(--cm-chart-1)", // #1B2D45 — navy
  "var(--cm-chart-2)", // #C8A96E — gold
  "var(--cm-chart-3)", // #3D6898 — navy-400
  "var(--cm-chart-4)", // #7B96B2 — slate-blue
  "var(--cm-chart-5)", // #8C7355 — warm brown
  "var(--cm-chart-6)", // #A3B8CC — lightest blue-slate
] as const;

/** Positive / negative semantic colors for KPI and gain/loss series. */
export const CM_GAIN = "var(--cm-gain)"; // #00873E
export const CM_LOSS = "var(--cm-loss)"; // #CC0000
