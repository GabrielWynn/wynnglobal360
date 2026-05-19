/** Shared merge validation + preview for master file (mirrors merge API rules). */

export interface MergeableRecord {
  id: string
  policy_number: string
  ifa_code: string | null
  currency: string
  platform_id?: string | null
  amount: number
  variable_amount?: number | null
  paid: number
  ifa_amount: number
  suspense_amount?: number
  wg_amount?: number
  status: string
  is_deleted?: boolean
  is_advance?: boolean
  linked_record_id?: string | null
  allocation_parent_id?: string | null
  payment_batch_id?: string | null
  transaction_date: string
  commission_type?: string | null
  has_allocations?: boolean
}

export interface MergePreview {
  amount: number
  variable_amount: number
  gross: number
  ifa_amount: number
  paid: number
  unpaid: number
  status: string
  transaction_date: string
}

function normPolicy(p: string) {
  return p.trim().toUpperCase()
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function getMergeBlockReason(rows: MergeableRecord[]): string | null {
  if (rows.length < 2) return 'Select at least 2 rows to merge'

  const policy = normPolicy(rows[0].policy_number)
  const ifaCode = rows[0].ifa_code
  const currency = rows[0].currency
  const platformId = rows[0].platform_id ?? null

  for (const r of rows) {
    if (r.is_deleted) return 'Cannot merge deleted rows'
    if (r.allocation_parent_id) return 'Cannot merge allocation child rows'
    if (r.has_allocations) return 'Remove commission allocations before merging'
    if (r.linked_record_id) return 'Cannot merge linked advance/reconcile rows'
    if (r.is_advance) return 'Cannot merge advance payment rows'
    if (r.payment_batch_id) return 'Cannot merge rows already in a payment batch'
    if (r.status === 'cancelled') return 'Cannot merge cancelled rows'
    if (r.status === 'reconciled') return 'Cannot merge reconciled rows'
    if (normPolicy(r.policy_number) !== policy) return 'Selected rows must share the same policy number'
    if (r.ifa_code !== ifaCode) return 'Selected rows must belong to the same IFA'
    if (r.currency !== currency) return 'Selected rows must use the same currency'
    if ((r.platform_id ?? null) !== platformId) return 'Selected rows must use the same platform'
  }

  return null
}

function previewStatus(rows: MergeableRecord[]): string {
  if (rows.every(r => r.status === 'paid')) return 'paid'
  if (rows.some(r => r.status === 'pending')) return 'pending'
  if (rows.every(r => r.status === 'approved')) return 'approved'
  const ifa = rows.reduce((s, r) => s + (r.ifa_amount ?? 0), 0)
  const paid = rows.reduce((s, r) => s + (r.paid ?? 0), 0)
  return paid >= ifa - 0.005 ? 'paid' : 'approved'
}

export function computeMergePreview(rows: MergeableRecord[]): MergePreview {
  const amount = round2(rows.reduce((s, r) => s + (r.amount ?? 0), 0))
  const variable_amount = round2(rows.reduce((s, r) => s + (r.variable_amount ?? 0), 0))
  const ifa_amount = round2(rows.reduce((s, r) => s + (r.ifa_amount ?? 0), 0))
  const paid = round2(rows.reduce((s, r) => s + (r.paid ?? 0), 0))
  const transaction_date = rows.map(r => r.transaction_date).sort().reverse()[0]

  return {
    amount,
    variable_amount,
    gross: round2(amount + variable_amount),
    ifa_amount,
    paid,
    unpaid: round2(ifa_amount - paid),
    status: previewStatus(rows),
    transaction_date,
  }
}
