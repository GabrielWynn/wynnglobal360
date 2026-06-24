'use client'

import { fmtMoney } from '@/lib/commission-format'

/**
 * Merge-selected-rows dialog, extracted from the master-file page.
 * Presentational: the candidate rows, computed preview, survivor selection,
 * error, and confirm/cancel actions are passed in. Renders nothing when closed.
 */

interface MergeRow {
  id: string
  transaction_date: string
  commission_type: string | null
  amount: number
  ifa_amount: number
  status: string
  policy_number: string
  ifa_code: string | null
}

interface MergePreview {
  amount: number
  variable_amount: number
  gross: number
  ifa_amount: number
  paid: number
  unpaid: number
  status: string
  transaction_date: string
}

interface MergeModalProps {
  open: boolean
  preview: MergePreview | null
  rows: MergeRow[]
  survivorId: string
  merging: boolean
  error: string
  onSurvivorChange: (id: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export function MergeModal({
  open, preview, rows, survivorId, merging, error, onSurvivorChange, onCancel, onConfirm,
}: MergeModalProps) {
  if (!open || !preview) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-[var(--wgi-navy)]">Merge selected rows</h2>
        <p className="text-sm text-gray-600">
          Only the rows you selected will be combined. Other rows for this policy are unchanged.
        </p>

        <div className="overflow-x-auto border border-gray-200 rounded">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">Primary</th>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Type</th>
                <th className="px-2 py-2 text-right">Received</th>
                <th className="px-2 py-2 text-right">IFA Comm</th>
                <th className="px-2 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.id} className={r.id === survivorId ? 'bg-[#eef3f9]' : ''}>
                  <td className="px-2 py-2">
                    <input
                      type="radio"
                      name="merge-survivor"
                      checked={survivorId === r.id}
                      onChange={() => onSurvivorChange(r.id)}
                    />
                  </td>
                  <td className="px-2 py-2">{r.transaction_date}</td>
                  <td className="px-2 py-2">{r.commission_type ?? '—'}</td>
                  <td className="px-2 py-2 text-right">${fmtMoney(r.amount)}</td>
                  <td className="px-2 py-2 text-right">${fmtMoney(r.ifa_amount)}</td>
                  <td className="px-2 py-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-[var(--wgi-bg)] border border-[var(--wgi-border)] rounded p-4 text-sm grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div><span className="text-gray-500 block text-xs">Received</span><strong>${fmtMoney(preview.amount)}</strong></div>
          <div><span className="text-gray-500 block text-xs">Expect</span><strong>${fmtMoney(preview.variable_amount)}</strong></div>
          <div><span className="text-gray-500 block text-xs">Gross</span><strong>${fmtMoney(preview.gross)}</strong></div>
          <div><span className="text-gray-500 block text-xs">IFA Comm</span><strong className="text-[var(--wgi-navy)]">${fmtMoney(preview.ifa_amount)}</strong></div>
          <div><span className="text-gray-500 block text-xs">Paid</span><strong>${fmtMoney(preview.paid)}</strong></div>
          <div><span className="text-gray-500 block text-xs">Unpaid</span><strong className="text-[var(--cm-loss)]">${fmtMoney(preview.unpaid)}</strong></div>
          <div><span className="text-gray-500 block text-xs">Status</span><strong>{preview.status}</strong></div>
          <div><span className="text-gray-500 block text-xs">Trans date</span><strong>{preview.transaction_date}</strong></div>
        </div>

        <p className="text-xs text-gray-500">
          Policy <strong>{rows[0]?.policy_number}</strong> · IFA <strong>{rows[0]?.ifa_code}</strong> · {rows.length} rows → 1 row
        </p>

        {error && (
          <p className="text-sm text-[var(--cm-status-rejected-text)] bg-[var(--cm-status-rejected-bg)] border border-[var(--cm-status-rejected-text)]/25 rounded px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={merging || !survivorId}
            className="flex-1 bg-[var(--wgi-navy)] text-white py-2 rounded text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40">
            {merging ? 'Merging…' : `Merge ${rows.length} rows`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MergeModal
