// lib/commission/normalize.ts
// Shared row-normalisation helpers for commission imports.
// Used by BOTH import paths so CSV and PDF rows go through one implementation:
//
//   CSV upload  →  /api/commission/process-upload  ─┐
//                                                   ├─→  normalizeDate / normalizeCommissionType
//   PDF extract →  /api/commission/extract-pdf    ─┘
//
import { parseAmount } from '@/lib/currency'

/**
 * Normalise a date string to YYYY-MM-DD so PostgreSQL DATE columns accept it.
 * Handles:
 *   DD/MM/YYYY  →  2025-11-13  (British / European — most common in this app)
 *   DD-MM-YYYY  →  2025-11-13
 *   YYYY-MM-DD  →  unchanged   (already ISO)
 * Returns null if the string is empty or unrecognised.
 */
export function normalizeDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY or D/M/YYYY (slash separator) — treat as DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // DD-MM-YYYY (dash separator, day first)
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dmyDash) {
    const [, d, m, y] = dmyDash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Unrecognised format — return null so the caller can flag a date warning
  // rather than sending an invalid string to a Postgres DATE column.
  return null
}

/**
 * Map raw platform commission type strings to canonical codes.
 * Platforms send inconsistent labels ("Initial Commission", "INIT", "Trail Fee", etc.)
 * We normalise to the 4 canonical codes stored in the commission_types seed table.
 * Unrecognised values are returned raw (truncated) so they stay visible.
 */
export function normalizeCommissionType(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()

  if (/\binitial\b/.test(s) || s === 'init' || s === 'first year') return 'Initial'
  if (/\btrail\b/.test(s) || /\btrailing\b/.test(s) || s === 'renewal trail') return 'Trail'
  if (/\brenewal\b/.test(s) || s === 'renew' || s === 'subsequent') return 'Renewal'
  if (/\bother\b/.test(s) || s === 'misc' || s === 'miscellaneous' || s === 'override') return 'Other'

  // Return raw (truncated) for unrecognised values — keeps data visible rather than silently discarding.
  // `|| null` converts a whitespace-only input to null rather than storing an empty string.
  return raw.slice(0, 255) || null
}

// ── PDF extraction row validation ─────────────────────────────────────────────

/** One warning attached to an extracted row (0-based index into the rows array). */
export interface RowWarning {
  row: number
  field: string
  message: string
  /** 'error' = required field unusable; 'warning' = recoverable (fallback applies) */
  severity: 'error' | 'warning'
}

/**
 * Coerce one extracted row (values may be numbers/null from the JSON extraction)
 * into the string-valued shape the existing CSV pipeline expects, and collect
 * validation warnings for required canonical fields.
 *
 * Required: policy_number, amount, transaction_date.
 * process-upload already has fallbacks ([NO POLICY], upload-date) — these
 * warnings exist so the admin sees problems BEFORE confirming the upload.
 */
export function normalizeExtractedRow(
  raw: Record<string, unknown>,
  index: number
): { row: Record<string, string>; warnings: RowWarning[] } {
  const row: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    row[key] = value === null || value === undefined ? '' : String(value).trim()
  }

  const warnings: RowWarning[] = []

  if (!row.policy_number) {
    warnings.push({
      row: index,
      field: 'policy_number',
      message: 'Missing policy number — would be saved as [NO POLICY]',
      severity: 'error',
    })
  }

  const amount = parseAmount(row.amount)
  if (!row.amount || amount === 0) {
    warnings.push({
      row: index,
      field: 'amount',
      message: row.amount ? `Amount "${row.amount}" parsed as 0` : 'Missing amount',
      severity: 'error',
    })
  }

  if (!row.transaction_date) {
    warnings.push({
      row: index,
      field: 'transaction_date',
      message: 'Missing transaction date — upload date would be used as fallback',
      severity: 'warning',
    })
  } else if (!normalizeDate(row.transaction_date)) {
    warnings.push({
      row: index,
      field: 'transaction_date',
      message: `Unrecognised date format "${row.transaction_date}" — upload date would be used as fallback`,
      severity: 'warning',
    })
  }

  if (row.currency && !/^[A-Z]{3}$/i.test(row.currency)) {
    warnings.push({
      row: index,
      field: 'currency',
      message: `"${row.currency}" is not a 3-letter currency code — default currency would be used`,
      severity: 'warning',
    })
  }

  return { row, warnings }
}
