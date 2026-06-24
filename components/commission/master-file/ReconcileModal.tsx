'use client'

/**
 * Reconcile-advance-with-statement confirmation dialog, extracted from the
 * master-file page. Presentational: all state + the reconcile action are passed
 * in. Renders nothing when closed.
 */

interface ReconcileRow {
  is_advance: boolean
  policy_number: string
  ifa_name: string | null
  ifa_amount: number
  currency: string
  transaction_date: string
}

interface ReconcileModalProps {
  open: boolean
  selectedRows: ReconcileRow[]
  reconciling: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ReconcileModal({ open, selectedRows, reconciling, onCancel, onConfirm }: ReconcileModalProps) {
  if (!open) return null

  const advRow = selectedRows.find(r => r.is_advance)
  const stmRow = selectedRows.find(r => !r.is_advance)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--wgi-navy)]">Reconcile Advance with Statement</h2>

        <div className="space-y-3 text-sm">
          <div className="bg-[var(--cm-status-advance-bg)] border border-[var(--cm-status-advance-text)]/25 rounded p-3">
            <p className="text-xs font-semibold text-[var(--cm-status-advance-text)] mb-1">Advance Payment</p>
            <p className="font-medium text-gray-900">{advRow?.policy_number} — {advRow?.ifa_name}</p>
            <p className="text-gray-500">${advRow?.ifa_amount?.toFixed(3)} {advRow?.currency} · {advRow?.transaction_date}</p>
          </div>
          <div className="bg-[var(--cm-status-approved-bg)] border border-[var(--cm-status-approved-text)]/25 rounded p-3">
            <p className="text-xs font-semibold text-[var(--cm-status-approved-text)] mb-1">Statement Entry (will be marked reconciled)</p>
            <p className="font-medium text-gray-900">{stmRow?.policy_number} — {stmRow?.ifa_name}</p>
            <p className="text-gray-500">${stmRow?.ifa_amount?.toFixed(3)} {stmRow?.currency} · {stmRow?.transaction_date}</p>
          </div>
        </div>

        <div className="bg-[var(--wgi-bg)] border border-[var(--wgi-border)] rounded p-3 text-xs text-gray-600 space-y-1">
          <p>After reconciliation:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Statement entry → <strong>reconciled</strong>, paid = IFA amount (unpaid = $0)</li>
            <li>Both records remain visible and linked to each other</li>
            <li>Advance record is unchanged</li>
          </ul>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={reconciling}
            className="flex-1 bg-[var(--wgi-navy)] text-white py-2 rounded text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40">
            {reconciling ? 'Reconciling…' : 'Confirm Reconcile'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ReconcileModal
