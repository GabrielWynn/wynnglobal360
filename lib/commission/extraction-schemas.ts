// lib/commission/extraction-schemas.ts
// Landing.ai ADE extraction schemas for PDF commission statements.
//
// Schemas emit CANONICAL field names (the same semantic fields the CSV
// column-mapping step maps to), so PDF uploads skip manual column mapping —
// the upload page passes an identity mapping straight to process-upload.
//
// v1 keeps schemas as code constants (git-reviewable). Promote to a DB table
// only if they start churning per-platform.
//
// To tune extraction for a specific platform, add an entry to
// PLATFORM_SCHEMA_OVERRIDES keyed by the platform's `code` from the
// `platforms` table (e.g. 'RL360', 'HANSARD') — otherwise the generic
// DEFAULT schema is used, which absorbs label variations via
// `x-alternativeNames`.

/** Canonical row field names — must match what the upload page + process-upload expect. */
export const CANONICAL_FIELDS = [
  'policy_number',
  'policy_holder_name',
  'transaction_date',
  'commission_type',
  'amount',
  'currency',
  'commencement_date',
] as const

export type CanonicalField = (typeof CANONICAL_FIELDS)[number]

/** Schema for a single commission row. Shared by the default and platform overrides. */
const ROW_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    policy_number: {
      type: 'string',
      description:
        'The policy, plan, bond or contract reference number for this commission line, exactly as printed (e.g. "RL123456789").',
      'x-alternativeNames': [
        'Policy No', 'Policy Number', 'Plan Number', 'Plan No', 'Policy Ref',
        'Bond Number', 'Contract Number', 'Account Number', 'Reference',
      ],
    },
    policy_holder_name: {
      type: 'string',
      description: 'Full name of the policy holder / client / investor for this line.',
      'x-alternativeNames': [
        'Policy Holder', 'Policyholder', 'Client Name', 'Client', 'Investor Name',
        'Owner', 'Assured', 'Life Assured', 'Customer Name',
      ],
    },
    transaction_date: {
      type: 'string',
      description:
        'The date of this commission transaction, formatted as YYYY-MM-DD. If printed as DD/MM/YYYY convert it to YYYY-MM-DD.',
      'x-alternativeNames': [
        'Date', 'Transaction Date', 'Payment Date', 'Process Date', 'Statement Date',
        'Due Date', 'Period', 'Value Date',
      ],
    },
    commission_type: {
      type: 'string',
      description:
        'The type of commission for this line, e.g. Initial, Trail, Renewal, Other, exactly as printed.',
      'x-alternativeNames': [
        'Type', 'Commission Type', 'Fee Type', 'Payment Type', 'Description',
        'Remuneration Type', 'Category',
      ],
    },
    amount: {
      type: 'number',
      description:
        'The gross commission amount for this line as a plain number (no currency symbols or thousands separators). Negative for clawbacks/reversals, e.g. -4312.50.',
      'x-alternativeNames': [
        'Amount', 'Commission', 'Commission Amount', 'Gross Amount', 'Gross Commission',
        'Fee', 'Payment Amount', 'Remuneration', 'Total',
      ],
    },
    currency: {
      type: 'string',
      description:
        'The 3-letter ISO currency code for this line (e.g. USD, GBP, EUR, AED). If only a symbol is printed, convert it ($→USD, £→GBP, €→EUR). Leave empty if no currency is shown.',
      'x-alternativeNames': ['Currency', 'Ccy', 'Curr'],
    },
    commencement_date: {
      type: 'string',
      description:
        'The policy commencement/start date formatted as YYYY-MM-DD, if shown for this line. Leave empty if not present.',
      'x-alternativeNames': [
        'Commencement Date', 'Start Date', 'Inception Date', 'Issue Date', 'Policy Start',
      ],
    },
  },
  required: ['policy_number', 'amount', 'transaction_date'],
} as const

/**
 * Generic extraction schema that works for any platform commission statement.
 * The `x-alternativeNames` lists absorb most label variations across platforms.
 */
export const DEFAULT_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      description:
        'Every individual commission line item in the statement. One entry per row of the commission/remuneration table(s). Do NOT include subtotal, total or summary rows.',
      items: ROW_ITEM_SCHEMA,
    },
  },
  required: ['rows'],
}

/**
 * Per-platform schema overrides, keyed by `platforms.code`.
 * Add an entry here when a platform's statement layout needs tighter
 * field descriptions than the generic default, e.g.:
 *
 *   RL360: { ...DEFAULT_EXTRACTION_SCHEMA, properties: { rows: { ...customised items... } } }
 */
const PLATFORM_SCHEMA_OVERRIDES: Record<string, Record<string, unknown>> = {}

/**
 * Return the ADE extraction schema for a platform code.
 * Falls back to the generic default schema, so PDF upload is available for
 * all platforms; per-platform overrides tighten extraction where needed.
 */
export function getExtractionSchema(platformCode: string): Record<string, unknown> {
  return PLATFORM_SCHEMA_OVERRIDES[platformCode?.toUpperCase?.() ?? ''] ?? DEFAULT_EXTRACTION_SCHEMA
}
