// lib/currency.ts
// Multi-currency formatting and parsing utilities.
// All money displays in the portal must go through these helpers —
// never sum amounts across different currencies.

/**
 * All currencies used across the platforms we process.
 * Extend this list as new platforms are onboarded.
 */
export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'AED', 'SGD', 'HKD', 'CHF', 'CAD', 'AUD', 'ZAR',
  'QAR', 'BHD', 'KWD', 'OMR', 'SAR',
] as const

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number] | string

/**
 * Format a number as a currency string using the browser/Node Intl API.
 * Falls back to plain number with currency code if the code is unrecognised.
 *
 * @example formatCurrency(1234.56, 'USD') → "$1,234.56"
 * @example formatCurrency(1234.56, 'AED') → "AED 1,234.56"  (depends on locale)
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode = 'USD',
  locale = 'en-US'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency as string,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    // Unknown currency code — fall back to plain number + code
    return `${currency} ${amount.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
}

/**
 * Parse a raw CSV amount string into a float.
 * Handles:
 *   - comma-formatted numbers: "7,560.00" → 7560.00
 *   - negative values:        "-4,312.50" → -4312.50
 *   - already numeric values:  1234.5    → 1234.5
 */
export function parseAmount(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return isFinite(raw) ? raw : 0
  const cleaned = String(raw).replace(/,/g, '').trim()
  const parsed = parseFloat(cleaned)
  return isFinite(parsed) ? parsed : 0
}

/**
 * Group monetary amounts by currency.
 * Use this when summarising amounts from mixed-currency records
 * to prevent incorrect cross-currency totals.
 *
 * @example
 *   groupByCurrency([
 *     { amount: 100, currency: 'USD' },
 *     { amount: 200, currency: 'USD' },
 *     { amount:  50, currency: 'EUR' },
 *   ])
 *   // → { USD: 300, EUR: 50 }
 */
export function groupByCurrency(
  items: { amount: number; currency: string }[]
): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, { amount, currency }) => {
    const key = (currency || 'USD').toUpperCase()
    acc[key] = (acc[key] ?? 0) + amount
    return acc
  }, {})
}

/**
 * Render a currency summary map (e.g. from groupByCurrency) as a readable string.
 * @example formatCurrencyMap({ USD: 1200, EUR: 400 }) → "$1,200.00 / €400.00"
 */
export function formatCurrencyMap(
  map: Record<string, number>,
  locale = 'en-US'
): string {
  return Object.entries(map)
    .map(([currency, amount]) => formatCurrency(amount, currency, locale))
    .join(' / ')
}
