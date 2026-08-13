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

/** IDAD: extract Commission and Marketing Support separately — summed in platform-extraction. */
const IDAD_ROW_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    policy_number: {
      type: 'string',
      description: 'Client or account reference for this line, exactly as printed.',
      'x-alternativeNames': [
        'Policy No', 'Policy Number', 'Account Number', 'Reference', 'Client Ref',
      ],
    },
    policy_holder_name: {
      type: 'string',
      description: 'Full name of the client / investor for this line.',
      'x-alternativeNames': ['Client Name', 'Client', 'Investor Name', 'Policy Holder'],
    },
    transaction_date: {
      type: 'string',
      description:
        'Statement or transaction date formatted as YYYY-MM-DD. Convert DD/MM/YYYY to YYYY-MM-DD.',
      'x-alternativeNames': ['Date', 'Transaction Date', 'Statement Date', 'Payment Date'],
    },
    currency: {
      type: 'string',
      description: '3-letter ISO currency code (USD, GBP, EUR). Convert symbols if needed.',
      'x-alternativeNames': ['Currency', 'Ccy'],
    },
    commission: {
      type: 'number',
      description:
        'Value from the Commission column only — do NOT include Marketing Support in this field.',
      'x-alternativeNames': ['Commission', 'Comm'],
    },
    marketing_support: {
      type: 'number',
      description: 'Value from the Marketing Support column only.',
      'x-alternativeNames': ['Marketing Support', 'Mkt Support', 'Marketing'],
    },
    cash_invested: {
      type: 'number',
      description: 'Value from the Cash Invested column as a plain number (no currency symbols).',
      'x-alternativeNames': ['Cash Invested', 'Cash Inv', 'Investment Amount'],
    },
    isin: {
      type: 'string',
      description: 'ISIN identifier for the product, e.g. XS3406628654.',
      'x-alternativeNames': ['ISIN', 'ISIN Number', 'ISIN No'],
    },
  },
  required: ['policy_number', 'commission', 'transaction_date', 'isin'],
}

/** ARDAN: Structured Note statements — extract Commission and Marketing Support
 *  separately (summed in platform-extraction) and the ISIN for the Type2 column.
 *  Kept as its own schema (rather than reusing IDAD's) so future ARDAN-specific
 *  label tweaks don't affect IDAD extraction. */
const ARDAN_ROW_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    policy_number: {
      type: 'string',
      description: 'Client or account reference for this line, exactly as printed.',
      'x-alternativeNames': [
        'Policy No', 'Policy Number', 'Account Number', 'Reference', 'Client Ref',
      ],
    },
    policy_holder_name: {
      type: 'string',
      description: 'Full name of the client / investor for this line.',
      'x-alternativeNames': ['Client Name', 'Client', 'Investor Name', 'Policy Holder'],
    },
    transaction_date: {
      type: 'string',
      description:
        'Statement or transaction date formatted as YYYY-MM-DD. Convert DD/MM/YYYY to YYYY-MM-DD.',
      'x-alternativeNames': ['Date', 'Transaction Date', 'Statement Date', 'Payment Date'],
    },
    currency: {
      type: 'string',
      description: '3-letter ISO currency code (USD, GBP, EUR). Convert symbols if needed.',
      'x-alternativeNames': ['Currency', 'Ccy'],
    },
    commission: {
      type: 'number',
      description:
        'Value from the Commission column only — do NOT include Marketing Support in this field.',
      'x-alternativeNames': ['Commission', 'Comm'],
    },
    marketing_support: {
      type: 'number',
      description: 'Value from the Marketing Support column only.',
      'x-alternativeNames': ['Marketing Support', 'Mkt Support', 'Marketing'],
    },
    cash_invested: {
      type: 'number',
      description: 'Value from the Cash Invested column as a plain number (no currency symbols).',
      'x-alternativeNames': ['Cash Invested', 'Cash Inv', 'Investment Amount'],
    },
    isin: {
      type: 'string',
      description: 'ISIN identifier for the structured note, e.g. XS3406628654.',
      'x-alternativeNames': ['ISIN', 'ISIN Number', 'ISIN No'],
    },
  },
  required: ['policy_number', 'commission', 'transaction_date', 'isin'],
}

/**
 * Portman Associates: "SPECIAL PAYMENT" Structured Note statements.
 * (platforms.code = 'PORTMAN'.)
 *
 * Layout: one statement-wide date, then repeating product blocks — a numbered
 * product heading, a "<CCY>: <ISIN>" line, then one payment line per policy:
 *   DAVID RATHBONE  $2,000  ARDAN  AP10036284  PAULA M  5%
 * followed by a final totals line (excluded). No commission amount is
 * printed directly — it's investment × commission % (computed in
 * platform-extraction.ts). The IFA name at the start of each line (e.g.
 * "DAVID RATHBONE") is intentionally NOT extracted — ifa_code/ifa_name are
 * resolved from policy_number via the existing Azure lookup, same as every
 * other platform.
 */
const PORTMAN_ROW_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    policy_number: {
      type: 'string',
      description:
        'The policy/account reference on this payment line, printed right after the product provider name (e.g. "AP10036284" in "... ARDAN AP10036284 PAULA M 5%"), exactly as printed.',
      'x-alternativeNames': ['Policy No', 'Policy Number', 'Account Number', 'Reference'],
    },
    policy_holder_name: {
      type: 'string',
      description:
        'The policy holder name on this payment line, printed between the policy number and the trailing commission percentage (e.g. "PAULA M" or "TINA P CRESPO" — may be one or more words).',
      'x-alternativeNames': ['Policy Holder', 'Holder', 'Client Name', 'Investor'],
    },
    transaction_date: {
      type: 'string',
      description:
        'The statement date near the top of the document, often written as an ordinal phrase (e.g. "6th of AUGUST 2026"). Convert it to YYYY-MM-DD (e.g. "2026-08-06"). This single date applies to every payment line in the statement.',
      'x-alternativeNames': ['Date', 'Payment Date', 'Statement Date'],
    },
    currency: {
      type: 'string',
      description:
        'The 3-letter ISO currency code printed with the ISIN for this product block (e.g. "USD" in "USD: XS3414109325"). Applies to every payment line listed under that heading.',
      'x-alternativeNames': ['Currency', 'Ccy'],
    },
    investment_amount: {
      type: 'number',
      description:
        'The investment amount on this payment line as a plain number, no currency symbol or thousands separator (e.g. 2000 for "$2,000").',
      'x-alternativeNames': ['Investment', 'Investment Amount', 'Amount Invested'],
    },
    commission_percentage: {
      type: 'number',
      description:
        'The commission percentage printed at the end of this payment line, as a plain number not a fraction (e.g. 5 for "5%").',
      'x-alternativeNames': ['Commission %', 'Comm %', 'Rate', 'Percentage'],
    },
    isin: {
      type: 'string',
      description:
        'The ISIN of the structured note this line belongs to, printed once per product block (e.g. "XS3414109325" in "USD: XS3414109325"). Every payment line below that heading — until the next numbered product heading — belongs to the same note; repeat its ISIN for each of those rows.',
      'x-alternativeNames': ['ISIN', 'ISIN Number', 'ISIN No'],
    },
  },
  required: ['policy_number', 'investment_amount', 'commission_percentage', 'isin', 'transaction_date'],
}

/**
 * Per-platform schema overrides, keyed by `platforms.code`.
 * Add an entry here when a platform's statement layout needs tighter
 * field descriptions than the generic default, e.g.:
 *
 *   RL360: { ...DEFAULT_EXTRACTION_SCHEMA, properties: { rows: { ...customised items... } } }
 */
const PLATFORM_SCHEMA_OVERRIDES: Record<string, Record<string, unknown>> = {
  IDAD: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        description:
          'Every commission line in the IDAD statement table. One entry per data row. Do NOT include subtotal or total rows.',
        items: IDAD_ROW_ITEM_SCHEMA,
      },
    },
    required: ['rows'],
  },
  ARDAN: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        description:
          'Every commission line in the ARDAN Structured Note statement table. One entry per data row. Do NOT include subtotal or total rows.',
        items: ARDAN_ROW_ITEM_SCHEMA,
      },
    },
    required: ['rows'],
  },
  // Portman Associates "SPECIAL PAYMENT" statements — see PORTMAN_ROW_ITEM_SCHEMA above.
  PORTMAN: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        description:
          'Every payment line across all product blocks in this Portman Associates statement. One entry per policy payment line. Do NOT include the product heading lines, the "<CCY>: <ISIN>" lines, or the final total line.',
        items: PORTMAN_ROW_ITEM_SCHEMA,
      },
    },
    required: ['rows'],
  },
}

/**
 * Return the ADE extraction schema for a platform code.
 * Falls back to the generic default schema, so PDF upload is available for
 * all platforms; per-platform overrides tighten extraction where needed.
 */
export function getExtractionSchema(platformCode: string): Record<string, unknown> {
  return PLATFORM_SCHEMA_OVERRIDES[platformCode?.toUpperCase?.() ?? ''] ?? DEFAULT_EXTRACTION_SCHEMA
}
