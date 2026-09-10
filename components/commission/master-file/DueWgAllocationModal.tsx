'use client'

/**
 * Cell-driven Due WG reconciliation. Opened by clicking a Due WG cell in the
 * master file. Presentational: all state + the reconcile/unlink actions are
 * passed in. Renders nothing when closed.
 *
 * Picking an adjustment IS the confirmation — one step, straight to
 * paid/green. There's no separate "mark as paid" step: by the time an admin
 * manually matches a Due WG row to a lump sum they've already verified it
 * belongs there.
 *
 * "Eligible" adjustments are ones where `received - mappedTotal > 0` — the
 * receipt isn't fully explained yet. A brand-new, untouched adjustment always
 * qualifies (nothing has been mapped against it); it drops off the list only
 * once fully accounted for. If this row is already reconciled, its linked
 * adjustment is shown separately above the picker even if it has since
 * become fully resolved and would otherwise no longer be eligible.
 */

interface AdjustmentSummary {
  id: string
  amount: number
  currency: string
  transaction_date: string
  sourceFile: string
  mappedTotal: number
  remaining: number    // amount - mappedTotal — what's still unexplained
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
  linkedAdjustment: AdjustmentSummary | null
  eligibleAdjustments: AdjustmentSummary[]
  selectedAdjustmentId: string | null
  onSelect: (id: string) => void
  allocating: boolean
  onCancel: () => void
  onConfirm: () => void
  onUnlink: () => void
}

function fmtMoney(v: number, currency: string) {
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)} ${currency}`
}

export function DueWgAllocationModal({
  open, record, linkedAdjustment, eligibleAdjustments, selectedAdjustmentId, onSelect,
  allocating, onCancel, onConfirm, onUnlink,
}: DueWgAllocationModalProps) {
  if (!open || !record) return null

  const isReconciled = !!linkedAdjustment
  // The linked adjustment's own row shouldn't also appear as a reassign option
  // unless it's still open — the eligible list already handles that via its
  // own remainder filter, so no extra exclusion needed here.

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--wgi-navy)]">
            {isReconciled ? 'Reconciled Due WG' : 'Reconcile Due WG'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {record.policy_number} — {record.ifa_name ?? '—'} · {fmtMoney(Number(record.due_wg ?? 0), record.currency)}
          </p>
        </div>

        {isReconciled && linkedAdjustment && (
          <div className="bg-[var(--cm-status-approved-bg)] border border-[var(--cm-status-approved-text)]/25 rounded p-3">
            <p className="text-xs font-semibold text-[var(--cm-status-approved-text)] mb-1">Currently reconciled against</p>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-900">{fmtMoney(linkedAdjustment.amount, linkedAdjustment.currency)} received</span>
              <span className="text-xs font-mono text-gray-500">{linkedAdjustment.transaction_date}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{linkedAdjustment.sourceFile}</p>
            <button onClick={onUnlink} disabled={allocating}
              className="mt-2 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-40">
              {allocating ? 'Removing…' : 'Remove allocation'}
            </button>
          </div>
        )}

        <div>
          {isReconciled && (
            <p className="text-xs font-semibold text-[var(--wgi-text-muted)] uppercase tracking-wide mb-1.5">Or reassign to a different adjustment</p>
          )}
          <div className="max-h-60 overflow-y-auto border border-[var(--wgi-border)] rounded divide-y divide-[var(--wgi-border)]">
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
                      Remaining {fmtMoney(adj.remaining, adj.currency)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {!isReconciled && (
          <div className="bg-[var(--wgi-bg)] border border-[var(--wgi-border)] rounded p-3 text-xs text-gray-600">
            Selecting an adjustment reconciles this row immediately — the cell turns green and the adjustment&rsquo;s Due updates right away.
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={allocating || !selectedAdjustmentId}
            className="flex-1 bg-[var(--wgi-navy)] text-white py-2 rounded text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40">
            {allocating ? 'Reconciling…' : (isReconciled ? 'Reassign' : 'Confirm Reconciled')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DueWgAllocationModal
