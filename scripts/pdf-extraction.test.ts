// scripts/pdf-extraction.test.ts
// Unit + fixture tests for the PDF commission extraction pipeline.
// Run with:  npm run test:pdf-extraction
//
// Covers (no network calls — Landing.ai responses are simulated fixtures):
//   1. Extraction schemas are structurally valid for the ADE extract API
//   2. normalizeDate handles all supported date formats
//   3. normalizeCommissionType maps platform labels to canonical codes
//   4. normalizeExtractedRow coerces simulated extraction output to the
//      string-valued canonical rows the CSV pipeline expects + warnings
import assert from 'node:assert/strict'
import {
  DEFAULT_EXTRACTION_SCHEMA,
  getExtractionSchema,
  CANONICAL_FIELDS,
} from '../lib/commission/extraction-schemas'
import {
  normalizeDate,
  normalizeCommissionType,
  normalizeExtractedRow,
} from '../lib/commission/normalize'

let passed = 0
let failed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    console.error(`  ✗ ${name}\n    ${err.message}`)
  }
}

// ── 1. Extraction schemas ─────────────────────────────────────────────────────

console.log('\nextraction-schemas')

// Keywords the ADE extract API supports — schemas must not stray outside these.
const SUPPORTED_KEYWORDS = new Set([
  'type', 'properties', 'items', 'required', 'description',
  'x-alternativeNames', 'enum', 'format', 'title',
])

function assertSupportedKeywords(node: unknown, path: string) {
  if (Array.isArray(node) || typeof node !== 'object' || node === null) return
  for (const [key, value] of Object.entries(node)) {
    if (path.endsWith('.properties') || path.endsWith('.x-alternativeNames')) {
      // keys here are field names, not schema keywords
      assertSupportedKeywords(value, `${path}.${key}`)
      continue
    }
    assert.ok(SUPPORTED_KEYWORDS.has(key), `Unsupported schema keyword "${key}" at ${path}`)
    assertSupportedKeywords(value, `${path}.${key}`)
  }
}

test('default schema root is an object with a required rows array', () => {
  const s = DEFAULT_EXTRACTION_SCHEMA as any
  assert.equal(s.type, 'object')
  assert.equal(s.properties.rows.type, 'array')
  assert.deepEqual(s.required, ['rows'])
})

test('row item schema only uses canonical field names', () => {
  const items = (DEFAULT_EXTRACTION_SCHEMA as any).properties.rows.items
  const keys = Object.keys(items.properties)
  for (const key of keys) {
    assert.ok(
      (CANONICAL_FIELDS as readonly string[]).includes(key),
      `Schema field "${key}" is not a canonical field`
    )
  }
})

test('row item schema requires policy_number, amount, transaction_date', () => {
  const items = (DEFAULT_EXTRACTION_SCHEMA as any).properties.rows.items
  assert.deepEqual([...items.required].sort(), ['amount', 'policy_number', 'transaction_date'])
})

test('schema uses only supported ADE keywords', () => {
  assertSupportedKeywords(DEFAULT_EXTRACTION_SCHEMA, '$')
})

test('getExtractionSchema falls back to the default for unknown platforms', () => {
  assert.equal(getExtractionSchema('SOME_UNKNOWN_PLATFORM'), DEFAULT_EXTRACTION_SCHEMA)
  assert.equal(getExtractionSchema('rl360'), getExtractionSchema('RL360'))
})

// ── 2. normalizeDate ──────────────────────────────────────────────────────────

console.log('\nnormalizeDate')

test('passes ISO dates through unchanged', () => {
  assert.equal(normalizeDate('2025-11-13'), '2025-11-13')
})

test('converts DD/MM/YYYY', () => {
  assert.equal(normalizeDate('13/11/2025'), '2025-11-13')
  assert.equal(normalizeDate('1/2/2025'), '2025-02-01')
})

test('converts DD-MM-YYYY', () => {
  assert.equal(normalizeDate('13-11-2025'), '2025-11-13')
})

test('returns null for empty or unrecognised input', () => {
  assert.equal(normalizeDate(''), null)
  assert.equal(normalizeDate('13 Nov 2025'), null)
  assert.equal(normalizeDate('garbage'), null)
})

// ── 3. normalizeCommissionType ────────────────────────────────────────────────

console.log('\nnormalizeCommissionType')

test('maps platform labels to canonical codes', () => {
  assert.equal(normalizeCommissionType('Initial Commission'), 'Initial')
  assert.equal(normalizeCommissionType('INIT'), 'Initial')
  assert.equal(normalizeCommissionType('Trail Fee'), 'Trail')
  assert.equal(normalizeCommissionType('renewal'), 'Renewal')
  assert.equal(normalizeCommissionType('Override'), 'Other')
})

test('keeps unrecognised types raw and nulls empty input', () => {
  assert.equal(normalizeCommissionType('Special Bonus'), 'Special Bonus')
  assert.equal(normalizeCommissionType(''), null)
})

// ── 4. normalizeExtractedRow (fixture: simulated ADE extract output) ─────────
// This fixture mirrors the shape Landing.ai extract returns for the default
// schema: numbers stay numbers, missing fields come back null/absent.

console.log('\nnormalizeExtractedRow')

const FIXTURE_EXTRACTION_ROWS: Record<string, unknown>[] = [
  // clean row — typical RL360-style line
  {
    policy_number: 'RL123456789',
    policy_holder_name: 'John Smith',
    transaction_date: '2025-11-13',
    commission_type: 'Initial Commission',
    amount: 7560.0,
    currency: 'USD',
    commencement_date: '2020-01-15',
  },
  // clawback with European date + lowercase currency
  {
    policy_number: 'HAN-0042',
    policy_holder_name: null,
    transaction_date: '13/11/2025',
    commission_type: 'Trail',
    amount: -4312.5,
    currency: 'gbp',
    commencement_date: null,
  },
  // broken row — missing policy + amount, garbage date and currency
  {
    policy_number: '',
    policy_holder_name: 'Jane Doe',
    transaction_date: 'Nov 13th',
    commission_type: 'Special',
    amount: null,
    currency: 'US DOLLARS',
  },
]

test('coerces all values to strings (CSV pipeline compatibility)', () => {
  const { row } = normalizeExtractedRow(FIXTURE_EXTRACTION_ROWS[0], 0)
  for (const value of Object.values(row)) assert.equal(typeof value, 'string')
  assert.equal(row.amount, '7560')
  assert.equal(row.policy_number, 'RL123456789')
})

test('clean row produces no warnings', () => {
  const { warnings } = normalizeExtractedRow(FIXTURE_EXTRACTION_ROWS[0], 0)
  assert.deepEqual(warnings, [])
})

test('negative amounts and DD/MM/YYYY dates are valid', () => {
  const { row, warnings } = normalizeExtractedRow(FIXTURE_EXTRACTION_ROWS[1], 1)
  assert.equal(row.amount, '-4312.5')
  // lowercase currency passes the case-insensitive 3-letter check
  assert.deepEqual(warnings, [])
})

test('null values become empty strings', () => {
  const { row } = normalizeExtractedRow(FIXTURE_EXTRACTION_ROWS[1], 1)
  assert.equal(row.policy_holder_name, '')
  assert.equal(row.commencement_date, '')
})

test('broken row collects errors for required fields + warnings for the rest', () => {
  const { warnings } = normalizeExtractedRow(FIXTURE_EXTRACTION_ROWS[2], 2)
  const byField = Object.fromEntries(warnings.map(w => [w.field, w]))
  assert.equal(byField.policy_number.severity, 'error')
  assert.equal(byField.amount.severity, 'error')
  assert.equal(byField.transaction_date.severity, 'warning') // fallback exists
  assert.equal(byField.currency.severity, 'warning')         // default applies
  for (const w of warnings) assert.equal(w.row, 2)
})

test('fixture batch maps to expected submit/exclude split', () => {
  const results = FIXTURE_EXTRACTION_ROWS.map((r, i) => normalizeExtractedRow(r, i))
  const invalid = new Set(
    results.flatMap(r => r.warnings).filter(w => w.severity === 'error').map(w => w.row)
  )
  // Rows 0 and 1 submit cleanly; row 2 is excluded by default in the UI
  assert.deepEqual([...invalid], [2])
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
