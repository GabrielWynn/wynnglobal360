import type { ValueFormatterParams, ValueParserParams } from 'ag-grid-community'

// ── Commission money / percent / date formatters + parsers ──────────────────────
// Extracted from the master-file grid so they can be reused across commission
// pages and unit-tested. Pure functions (the ag-grid ones only read p.value /
// p.newValue / p.node).

/** Format a number with thousands separators and 3 decimals; keeps the sign. */
export const fmtMoney = (n: number): string => {
  const [int, dec] = Math.abs(n).toFixed(3).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (n < 0 ? '-' : '') + grouped + '.' + dec
}

/** ag-grid value formatter: money, defaulting to 0.000 when null. */
export const fmtNum = (p: ValueFormatterParams): string =>
  p.value != null ? fmtMoney(Number(p.value)) : '0.000'

/** ag-grid value formatter: fraction (0–1) rendered as a 4-dp percent, or em dash. */
export const fmtPct = (p: ValueFormatterParams): string =>
  (p.value != null && Number(p.value) !== 0) ? `${(Number(p.value) * 100).toFixed(4)}%` : '—'

/** ag-grid value parser: a typed percent (e.g. "12.5%") back to a 0–1 fraction. */
export const parsePct = (p: ValueParserParams): number => {
  const v = parseFloat(String(p.newValue).replace('%', ''))
  return isNaN(v) ? (p.oldValue as number) : v / 100
}

/** ag-grid value parser: a typed amount ("$1,200") to a number, or null when blank. */
export const parseAmt = (p: ValueParserParams): number | null => {
  const str = String(p.newValue ?? '').replace(/[$,]/g, '').trim()
  if (str === '') return null
  const v = parseFloat(str)
  return isNaN(v) ? (p.oldValue as number) : v
}

/** ag-grid value formatter: ISO date (YYYY-MM-DD) as dd/mm/yy; blank on pinned rows. */
export const fmtDate = (p: ValueFormatterParams): string => {
  if (p.node?.rowPinned || !p.value) return ''
  const [y, m, d] = String(p.value).split('-')
  if (!y || !m || !d) return p.value
  return `${d}/${m}/${y.slice(2)}`
}

/**
 * Normalize a raw commission-type string to a canonical label.
 * Mirror of the server-side normalizer in process-upload/route.ts.
 */
export function normalizeCommissionType(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  if (/\binitial\b/.test(s) || s === 'init' || s === 'first year') return 'Initial'
  if (/\btrail\b/.test(s) || /\btrailing\b/.test(s) || s === 'renewal trail') return 'Trail'
  if (/\brenewal\b/.test(s) || s === 'renew' || s === 'subsequent') return 'Renewal'
  if (/\bother\b/.test(s) || s === 'misc' || s === 'miscellaneous' || s === 'override') return 'Other'
  return raw.slice(0, 255) || null
}
