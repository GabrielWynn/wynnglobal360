'use client'

/**
 * Allocation-breakdown side panel for a commission record, extracted from the
 * master-file page. Presentational: the record, its allocations, the
 * in-progress delete id, and the close/add/delete actions are passed in.
 * Renders nothing when there is no record.
 */

interface AllocationRow {
  id: string
  source_bucket: string
  percentage: number
  secondary_ifa_code: string
  secondary_ifa_name: string | null
}

interface AllocRecord {
  id: string
  policy_number: string
  ifa_code: string | null
  ifa_name: string | null
  amount: number
  ifa_percentage: number
  wgi_percentage: number
  suspense_percentage: number
  ifa_amount: number
  wg_amount: number
  suspense_amount: number
}

interface AllocationPanelProps {
  record: AllocRecord | null
  allocations: AllocationRow[]
  deletingAllocId: string | null
  onClose: () => void
  onAddAllocation: () => void
  onDeleteAllocation: (id: string) => void
}

const fmtP = (v: number) => `${(v * 100).toFixed(2)}%`
const fmtA = (v: number) => `$${v.toFixed(3)}`

export function AllocationPanel({
  record, allocations, deletingAllocId, onClose, onAddAllocation, onDeleteAllocation,
}: AllocationPanelProps) {
  if (!record) return null

  const wgiAllocd  = allocations.filter(a => a.source_bucket === 'wgi').reduce((s, a) => s + a.percentage, 0)
  const ifaAllocd  = allocations.filter(a => a.source_bucket === 'ifa').reduce((s, a) => s + a.percentage, 0)
  const suspAllocd = allocations.filter(a => a.source_bucket === 'suspense').reduce((s, a) => s + a.percentage, 0)
  const origWgi    = record.wgi_percentage + wgiAllocd
  const origIfa    = record.ifa_percentage + ifaAllocd
  const origSusp   = record.suspense_percentage + suspAllocd

  return (
    <div className="fixed inset-0 z-40 flex justify-end pointer-events-none">
      {/* backdrop — only covers area, closes panel on click */}
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />
      <div className="relative pointer-events-auto w-full max-w-xl bg-white shadow-2xl border-l border-[var(--wgi-border)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-[var(--wgi-bg)] border-b border-[var(--wgi-border)] flex-shrink-0">
          <div>
            <p className="text-sm font-bold text-[var(--wgi-navy)]">Allocation Breakdown</p>
            <p className="text-xs text-[var(--wgi-text-muted)]">{record.policy_number} — {record.ifa_code} / {record.ifa_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onAddAllocation}
              className="text-xs px-3 py-1.5 bg-[var(--wgi-navy)] text-white rounded font-medium hover:bg-[var(--wgi-navy-600)]"
            >
              + Add Allocation
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-1">✕</button>
          </div>
        </div>
        {/* Breakdown table */}
        <div className="flex-1 overflow-y-auto p-5">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--wgi-bg)] text-[var(--wgi-text-muted)]">
                <th className="text-left px-3 py-2 border border-[var(--wgi-border)] font-semibold">Party</th>
                <th className="text-right px-3 py-2 border border-[var(--wgi-border)] font-semibold">Uploaded %</th>
                <th className="text-right px-3 py-2 border border-[var(--wgi-border)] font-semibold">Effective %</th>
                <th className="text-right px-3 py-2 border border-[var(--wgi-border)] font-semibold">Effective Amt</th>
                <th className="px-3 py-2 border border-[var(--wgi-border)]"></th>
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-gray-50">
                <td className="px-3 py-2 border border-gray-200 font-semibold">{record.ifa_code} <span className="font-normal text-gray-400">(Primary IFA)</span></td>
                <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(origIfa)}</td>
                <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(record.ifa_percentage)}</td>
                <td className="px-3 py-2 border border-gray-200 text-right">{fmtA(record.ifa_amount)}</td>
                <td className="px-3 py-2 border border-gray-200"></td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-3 py-2 border border-gray-200">WGI</td>
                <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(origWgi)}</td>
                <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(record.wgi_percentage)}</td>
                <td className="px-3 py-2 border border-gray-200 text-right">{fmtA(record.wg_amount)}</td>
                <td className="px-3 py-2 border border-gray-200"></td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-3 py-2 border border-gray-200">IFA Suspense</td>
                <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(origSusp)}</td>
                <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(record.suspense_percentage)}</td>
                <td className="px-3 py-2 border border-gray-200 text-right">{fmtA(record.suspense_amount)}</td>
                <td className="px-3 py-2 border border-gray-200"></td>
              </tr>
              {allocations.map(alloc => (
                <tr key={alloc.id} className="bg-[var(--cm-status-advance-bg)]">
                  <td className="px-3 py-2 border border-[var(--cm-status-advance-text)]/20">
                    <span className="font-semibold text-[var(--cm-status-advance-text)]">{alloc.secondary_ifa_code}</span>
                    {alloc.secondary_ifa_name && <span className="text-[var(--cm-status-advance-text)]"> — {alloc.secondary_ifa_name}</span>}
                    <span className="ml-1 text-[10px] italic text-[var(--cm-status-advance-text)]/70">(Secondary IFA · from {alloc.source_bucket.toUpperCase()})</span>
                  </td>
                  <td className="px-3 py-2 border border-[var(--cm-status-advance-text)]/20 text-right text-gray-400">—</td>
                  <td className="px-3 py-2 border border-[var(--cm-status-advance-text)]/20 text-right font-bold text-[var(--cm-status-advance-text)]">{fmtP(alloc.percentage)}</td>
                  <td className="px-3 py-2 border border-[var(--cm-status-advance-text)]/20 text-right font-bold text-[var(--cm-status-advance-text)]">{fmtA(record.amount * alloc.percentage)}</td>
                  <td className="px-3 py-2 border border-[var(--cm-status-advance-text)]/20 text-center">
                    <button
                      onClick={() => onDeleteAllocation(alloc.id)}
                      disabled={deletingAllocId === alloc.id}
                      className="text-[11px] px-2 py-0.5 bg-[var(--cm-status-rejected-bg)] text-[var(--cm-status-rejected-text)] border border-[var(--wgi-border)] rounded hover:border-[var(--cm-status-rejected-text)] disabled:opacity-40"
                    >
                      {deletingAllocId === alloc.id ? '…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {allocations.length === 0 && (
            <p className="text-xs text-gray-400 mt-4 text-center">No allocations yet. Click &quot;+ Add Allocation&quot; to create one.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default AllocationPanel
