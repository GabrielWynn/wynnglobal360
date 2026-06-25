'use client'

import type { Dispatch, SetStateAction } from 'react'

/**
 * Add-allocation dialog (redirect part of a commission to a secondary IFA),
 * extracted from the master-file page. Presentational: the parent record, its
 * existing allocations, the form state + setter, and submit/close actions are
 * passed in. The derived bucket / available / preview values are computed here.
 * Renders nothing when closed.
 */

export interface AllocFormState {
  secondary_ifa_id: string
  percentage: string
  source_bucket: string
  notes: string
}

interface AllocParent {
  policy_number: string
  ifa_code: string | null
  ifa_name: string | null
  amount: number
  wgi_percentage: number
  ifa_percentage: number
  suspense_percentage: number
  wg_amount: number
  ifa_amount: number
  suspense_amount: number
}

interface AddAllocationModalProps {
  open: boolean
  parent: AllocParent | null
  existingAllocations: { source_bucket: string; percentage: number }[]
  form: AllocFormState
  setForm: Dispatch<SetStateAction<AllocFormState>>
  saving: boolean
  error: string
  ifaList: { id: string; code: string; name: string }[]
  onClose: () => void
  onSubmit: () => void
}

export function AddAllocationModal({
  open, parent, existingAllocations, form, setForm, saving, error, ifaList, onClose, onSubmit,
}: AddAllocationModalProps) {
  if (!open || !parent) return null

  const bucketPct = form.source_bucket === 'wgi'
    ? parent.wgi_percentage
    : form.source_bucket === 'ifa'
      ? parent.ifa_percentage
      : parent.suspense_percentage
  const alreadyAllocd = existingAllocations
    .filter(a => a.source_bucket === form.source_bucket)
    .reduce((s, a) => s + a.percentage, 0)
  const available = bucketPct - alreadyAllocd
  const previewPct = parseFloat(form.percentage) / 100
  const previewAmt = !isNaN(previewPct) ? parent.amount * previewPct : 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--wgi-navy)]">Add Allocation</h2>
            <p className="text-xs text-gray-500 mt-0.5">{parent.policy_number} — {parent.ifa_code} / {parent.ifa_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {error && (
          <div className="mb-3 bg-[var(--cm-status-rejected-bg)] border border-[var(--cm-status-rejected-text)]/25 text-[var(--cm-status-rejected-text)] px-3 py-2 rounded text-sm">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Source Bucket</label>
            <select
              value={form.source_bucket}
              onChange={e => setForm(f => ({ ...f, source_bucket: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            >
              <option value="wgi">WGI ({(parent.wgi_percentage * 100).toFixed(2)}% → ${parent.wg_amount?.toFixed(3)})</option>
              <option value="ifa">IFA ({(parent.ifa_percentage * 100).toFixed(2)}% → ${parent.ifa_amount?.toFixed(3)})</option>
              <option value="suspense">Suspense ({(parent.suspense_percentage * 100).toFixed(2)}% → ${parent.suspense_amount?.toFixed(3)})</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Available from {form.source_bucket.toUpperCase()}: <strong className="text-[var(--wgi-navy)]">{(available * 100).toFixed(2)}%</strong>
              {' '}= <strong className="text-[var(--wgi-navy)]">${(parent.amount * available).toFixed(3)}</strong>
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Percentage to redirect (0–100) <span className="text-red-500">*</span></label>
            <input
              type="number" min="0.01" max="100" step="0.01"
              placeholder={`Max ${(available * 100).toFixed(2)}`}
              value={form.percentage}
              onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
            {form.percentage && !isNaN(previewPct) && previewPct > 0 && (
              <p className="text-xs text-[var(--wgi-navy)] mt-1">
                = <strong>${previewAmt.toFixed(3)}</strong> redirected to secondary IFA
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Secondary IFA <span className="text-red-500">*</span></label>
            <select
              value={form.secondary_ifa_id}
              onChange={e => setForm(f => ({ ...f, secondary_ifa_id: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            >
              <option value="">— select IFA —</option>
              {ifaList.filter(i => i.code !== parent.ifa_code).map(i => (
                <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text"
              placeholder="e.g. Producer works under supervising IFA"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={saving}
            className="flex-1 bg-[var(--wgi-navy)] text-white py-2 rounded text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40">
            {saving ? 'Creating…' : 'Create Allocation'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddAllocationModal
