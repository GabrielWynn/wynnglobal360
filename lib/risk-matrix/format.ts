const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09-28" → "28 sep 2026" */
export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${+d} ${MESES[+m - 1]} ${y}`;
}

export function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("es-PA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Today's date in the browser's timezone, as YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
