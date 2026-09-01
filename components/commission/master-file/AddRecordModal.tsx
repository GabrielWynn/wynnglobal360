'use client'

import type { Dispatch, SetStateAction } from 'react'

/**
 * New-commission-record form dialog, extracted from the master-file page.
 * Presentational: the form state + setter, reference lists, computed preview,
 * and submit/close actions are passed in. Renders nothing when closed.
 */

export interface AddRecordFormState {
  transaction_date: string
  policy_number: string
  policy_holder_name: string
  ifa_id: string
  platform_id: string
  commission_type: string
  type2: string
  amount: string
  currency: string
  ifa_percentage: string
  suspense_percentage: string
  wgi_percentage: string
  pending_percentage: string
  status: string
  notes: string
  is_advance: boolean
}

interface AddRecordModalProps {
  open: boolean
  form: AddRecordFormState
  setForm: Dispatch<SetStateAction<AddRecordFormState>>
  saving: boolean
  error: string
  ifaList: { id: string; code: string; name: string }[]
  platformList: { id: string; name: string }[]
  preview: { ifa: number; susp: number; wgi: number; pdng: number }
  onClose: () => void
  onSubmit: () => void
}

const EDITABLE = 'w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-[#FAF5EA]'
const PLAIN = 'w-full border border-gray-300 rounded px-3 py-1.5 text-sm'

export function AddRecordModal({
  open, form, setForm, saving, error, ifaList, platformList, preview, onClose, onSubmit,
}: AddRecordModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-[var(--wgi-navy)]">New Commission Record</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {error && (
          <div className="mb-3 bg-[var(--cm-status-rejected-bg)] border border-[var(--cm-status-rejected-text)]/25 text-[var(--cm-status-rejected-text)] px-3 py-2 rounded text-sm">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Transaction Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.transaction_date}
              onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))}
              className={PLAIN} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Policy Number <span className="text-red-500">*</span></label>
            <input type="text" placeholder="e.g. RS02018475" value={form.policy_number}
              onChange={e => setForm(f => ({ ...f, policy_number: e.target.value }))}
              className={PLAIN} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Policy Holder Name</label>
            <input type="text" value={form.policy_holder_name}
              onChange={e => setForm(f => ({ ...f, policy_holder_name: e.target.value }))}
              className={PLAIN} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">IFA</label>
            <select value={form.ifa_id}
              onChange={e => setForm(f => ({ ...f, ifa_id: e.target.value }))}
              className={PLAIN}>
              <option value="">— none —</option>
              {ifaList.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Platform</label>
            <select value={form.platform_id}
              onChange={e => setForm(f => ({ ...f, platform_id: e.target.value }))}
              className={PLAIN}>
              <option value="">— none —</option>
              {platformList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Commission Type</label>
            <input type="text" placeholder="e.g. Initial, Renewal, Structured Note" value={form.commission_type}
              onChange={e => setForm(f => ({ ...f, commission_type: e.target.value }))}
              className={PLAIN} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type2 / ISIN <span className="text-gray-400 font-normal">(Structured Notes)</span></label>
            <input type="text" placeholder="e.g. XS3406628654" value={form.type2}
              onChange={e => setForm(f => ({ ...f, type2: e.target.value }))}
              className={PLAIN} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount <span className="text-red-500">*</span></label>
            <input type="number" min="0.01" step="0.01" placeholder="e.g. 1000.00" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className={PLAIN} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
            <select value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className={PLAIN}>
              {['USD','EUR','GBP','AED','SGD','CHF'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">IFA % (0–100)</label>
            <input type="number" min="0" max="100" step="0.01" value={form.ifa_percentage}
              onChange={e => setForm(f => ({ ...f, ifa_percentage: e.target.value }))}
              className={EDITABLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">IFA Susp % (0–100)</label>
            <input type="number" min="0" max="100" step="0.01" value={form.suspense_percentage}
              onChange={e => setForm(f => ({ ...f, suspense_percentage: e.target.value }))}
              className={EDITABLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">WGI % (0–100)</label>
            <input type="number" min="0" max="100" step="0.01" value={form.wgi_percentage}
              onChange={e => setForm(f => ({ ...f, wgi_percentage: e.target.value }))}
              className={EDITABLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pdng % (0–100)</label>
            <input type="number" min="0" max="100" step="0.01" value={form.pending_percentage}
              onChange={e => setForm(f => ({ ...f, pending_percentage: e.target.value }))}
              className={EDITABLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              disabled={form.is_advance}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm disabled:opacity-50">
              {['pending','approved','paid','cancelled','advance','reconciled'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* Advance payment toggle */}
          <div className="col-span-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_advance}
                onChange={e => {
                  const v = e.target.checked
                  setForm(f => ({
                    ...f,
                    is_advance: v,
                    status: v ? 'advance' : 'pending',
                    commission_type: v && !f.commission_type ? 'Advance' : f.commission_type,
                    notes: v && !f.notes ? 'Advance payment — awaiting official statement' : f.notes,
                  }))
                }}
                className="rounded border-gray-300"
              />
              <span className="text-xs font-medium text-[var(--cm-status-advance-text)]">
                This is an advance payment (paid before statement arrives)
              </span>
            </label>
            {form.is_advance && (
              <p className="text-xs text-[var(--cm-status-advance-text)] mt-1 ml-5">
                Record will be tagged as <strong>Advance</strong>. Once the official statement arrives, select both records and click <strong>Merge</strong>.
              </p>
            )}
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} rows={2}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className={PLAIN} />
          </div>
        </div>

        {/* Live preview */}
        {form.amount && (
          <div className="mt-4 bg-[var(--wgi-bg)] border border-[var(--wgi-border)] rounded p-3">
            <p className="text-xs font-semibold text-[var(--wgi-navy)] mb-1">Calculated Preview</p>
            <div className="grid grid-cols-3 gap-2 text-xs text-[var(--wgi-text-muted)]">
              <span>IFA Comm: <strong>${preview.ifa.toFixed(3)}</strong></span>
              <span>IFA Susp: <strong>${preview.susp.toFixed(3)}</strong></span>
              <span>WGI: <strong>${preview.wgi.toFixed(3)}</strong></span>
              <span>Pdng$: <strong>${preview.pdng.toFixed(3)}</strong></span>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={saving}
            className="flex-1 bg-[var(--wgi-navy)] text-white py-2 rounded text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40">
            {saving ? 'Saving…' : 'Add Record'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddRecordModal
