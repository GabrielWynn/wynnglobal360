// lib/commission/platform-extraction.ts
// Platform-specific post-processing after Landing.ai ADE extract, before row
// normalisation. Schemas pull raw statement columns; this layer applies business
// rules (sums, field remapping) that belong in app code, not the Playground.
import { parseAmount } from '@/lib/currency'

function str(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return parseAmount(str(value))
}

/**
 * IDAD statements list Commission and Marketing Support as separate columns.
 * The payable commission is their sum. ISIN goes to `type2` (Structured
 * Notes ISIN column); Cash Invested is stored on the row as `ape` for the
 * master file APE IFA column.
 */
export function transformIdadRow(raw: Record<string, unknown>): Record<string, unknown> {
  const commission = num(raw.commission ?? raw.amount)
  const marketingSupport = num(raw.marketing_support)
  const total = commission + marketingSupport

  const isin = str(raw.isin || raw.commission_type)
  const cashInvested = num(raw.cash_invested)

  const out: Record<string, unknown> = {
    policy_number: raw.policy_number,
    policy_holder_name: raw.policy_holder_name,
    transaction_date: raw.transaction_date,
    currency: raw.currency,
    amount: total,
    commission_type: 'Structured Note',
    type2: isin,
  }

  if (cashInvested !== 0) out.ape = cashInvested

  return out
}

/**
 * ARDAN Structured Note statements: same shape as IDAD (Commission +
 * Marketing Support summed into Received; ISIN into `type2`), kept as its
 * own function per platform so future ARDAN-specific tweaks don't affect IDAD.
 */
export function transformArdanRow(raw: Record<string, unknown>): Record<string, unknown> {
  const commission = num(raw.commission ?? raw.amount)
  const marketingSupport = num(raw.marketing_support)
  const total = commission + marketingSupport

  const isin = str(raw.isin || raw.commission_type)
  const cashInvested = num(raw.cash_invested)

  const out: Record<string, unknown> = {
    policy_number: raw.policy_number,
    policy_holder_name: raw.policy_holder_name,
    transaction_date: raw.transaction_date,
    currency: raw.currency,
    amount: total,
    commission_type: 'Structured Note',
    type2: isin,
  }

  if (cashInvested !== 0) out.ape = cashInvested

  return out
}

/**
 * Portman Associates "SPECIAL PAYMENT" Structured Note statements
 * (platforms.code = 'PORTMAN'). No commission amount is printed on the
 * statement — it's investment amount × commission %. ISIN goes to `type2`;
 * policy number and holder name are extracted as printed, unchanged.
 */
export function transformPortmanRow(raw: Record<string, unknown>): Record<string, unknown> {
  const investment = num(raw.investment_amount)
  const pct = num(raw.commission_percentage)
  const amount = investment * (pct / 100)

  const isin = str(raw.isin)

  return {
    policy_number: raw.policy_number,
    policy_holder_name: raw.policy_holder_name,
    transaction_date: raw.transaction_date,
    currency: raw.currency,
    amount,
    commission_type: 'Structured Note',
    type2: isin,
  }
}

const PLATFORM_TRANSFORMS: Record<string, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  IDAD: transformIdadRow,
  ARDAN: transformArdanRow,
  PORTMAN: transformPortmanRow,
}

/** Apply platform-specific row transforms when configured; otherwise pass through. */
export function transformExtractedRow(
  platformCode: string,
  raw: Record<string, unknown>
): Record<string, unknown> {
  const fn = PLATFORM_TRANSFORMS[platformCode?.toUpperCase?.() ?? '']
  return fn ? fn(raw) : raw
}
