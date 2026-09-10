'use client'

/**
 * Allocate a Due WG row to the Agent Adjustments lump-sum payment it belongs
 * to. Presentational: all state + the allocate action are passed in.
 * Renders nothing when closed.
 *
 * "Eligible" adjustments are ones where `received - paidTotal > 0` — the
 * receipt isn't fully explained yet. A brand-new, untouched adjustment always
 * qualifies (nothing has been confirmed paid against it); it drops off the
 * list only once fully accounted for.
 */

interface EligibleAdjustment {
  id: string
  amount: number
  currency: string
  transaction_date: string
  sourceFile: string
  due: number          // -(sum of that adjustment's rows still pending)
  paidTotal: number
  remainder: number    // amount - paidTotal — what's still unexplained
}

interface DueWgRow {
  id: string
  policy_number: string
  ifa_name: string | null
  due_wg: number | null
  currency: string
}

interface DueWgAllocationModalProps {
  open: boolean
  record: DueWgRow | null
  eligibleAdjustments: EligibleAdjustment[]
  selectedAdjustmentId: string | null
  onSelect: (id: string) => void
  allocating: boolean
  onCancel: () => void
  onConfirm: () => void
}

function fmtMoney(v: number, currency: string) {
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)} ${currency}`
}

export function DueWgAllocationModal({
  open, record, eligibleAdjustments, selectedAdjustmentId, onSelect, allocating, onCancel, onConfirm,
}: DueWgAllocationModalProps) {
  if (!open || !record) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--wgi-navy)]">Allocate Due WG</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {record.policy_number} — {record.ifa_name ?? '—'} · {fmtMoney(Number(record.due_wg ?? 0), record.currency)}
          </p>
        </div>

        <div className="max-h-72 overflow-y-auto border border-[var(--wgi-border)] rounded divide-y divide-[var(--wgi-border)]">
          {eligibleAdjustments.length === 0 && (
            <p className="text-sm text-gray-500 p-4">No eligible Agent Adjustments right now — every imported lump sum is already fully accounted for.</p>
          )}
          {eligibleAdjustments.map(adj => {
            const selected = adj.id === selectedAdjustmentId
            return (
              <button
                key={adj.id}
                onClick={() => onSelect(adj.id)}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--wgi-bg)] ${selected ? 'bg-[var(--cm-status-advance-bg)]' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{fmtMoney(adj.amount, adj.currency)} received</span>
                  <span className="text-xs font-mono text-gray-500">{adj.transaction_date}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-gray-500">{adj.sourceFile}</span>
                  <span className="text-xs font-mono font-semibold" style={{ color: 'var(--cm-status-pending-text)' }}>
                    Due {fmtMoney(adj.due, adj.currency)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="bg-[var(--wgi-bg)] border border-[var(--wgi-border)] rounded p-3 text-xs text-gray-600">
          Allocating links this row as <strong>pending</strong> — it doesn&rsquo;t reduce the adjustment&rsquo;s Due yet.
          Confirming it as paid (from the master file, once you&rsquo;ve verified the money) is what settles it.
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={allocating || !selectedAdjustmentId}
            className="flex-1 bg-[var(--wgi-navy)] text-white py-2 rounded text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40">
            {allocating ? 'Allocating…' : 'Confirm Allocation'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DueWgAllocationModal
