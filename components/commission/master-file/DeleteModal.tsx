'use client'

/**
 * Soft-delete confirmation dialog for selected master-file records, extracted
 * from the page. Presentational: all derived flags + state + the delete action
 * are passed in. Renders nothing when closed.
 */

interface DeleteModalProps {
  open: boolean
  count: number
  paidSelectedCount: number
  /** When true, require typing DELETE; otherwise a checkbox suffices. */
  requireTypedConfirm: boolean
  /** Whether the confirm button is enabled (typed text / checkbox satisfied). */
  deleteEnabled: boolean
  deleting: boolean
  deleteTyped: string
  deleteConfirm: boolean
  onTypedChange: (value: string) => void
  onConfirmChange: (value: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteModal({
  open, count, paidSelectedCount, requireTypedConfirm, deleteEnabled, deleting,
  deleteTyped, deleteConfirm, onTypedChange, onConfirmChange, onCancel, onConfirm,
}: DeleteModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--wgi-navy)]">
          Delete {count} Record{count !== 1 ? 's' : ''}?
        </h2>

        {paidSelectedCount > 0 && (
          <div className="bg-[var(--cm-alert-warning-bg)] border border-[var(--cm-alert-warning-border)] text-[var(--cm-alert-warning-text)] px-3 py-2 rounded text-sm">
            ⚠️ <strong>{paidSelectedCount}</strong> of the selected record{paidSelectedCount !== 1 ? 's are' : ' is'} already <strong>paid</strong>.
            Deleting will not reverse any payment batches.
          </div>
        )}

        <p className="text-sm text-gray-600">
          Records will be <strong>soft-deleted</strong> — hidden from normal view but retained in the database.
          Use <em>Show Deleted</em> to view them later.
        </p>

        {requireTypedConfirm ? (
          <div>
            <p className="text-sm text-[var(--cm-status-rejected-text)] font-medium mb-2">
              Deleting {count} records. Type <strong>DELETE</strong> to confirm:
            </p>
            <input type="text" value={deleteTyped}
              onChange={e => onTypedChange(e.target.value)}
              placeholder="Type DELETE"
              className="cm-mono w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>
        ) : (
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={deleteConfirm}
              onChange={e => onConfirmChange(e.target.checked)} className="mt-0.5" />
            <span className="text-sm text-gray-700">I understand this cannot be undone from the interface.</span>
          </label>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting || !deleteEnabled}
            className="flex-1 bg-[var(--cm-status-rejected-text)] text-white py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-40">
            {deleting ? 'Deleting…' : `Delete ${count} Record${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteModal
