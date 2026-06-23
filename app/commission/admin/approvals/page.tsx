'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthHeaders } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'

interface Transaction {
  id: string
  ifa_id: string
  policy_id: string
  commission_type_code: string
  transaction_date: string
  gross_amount: number
  ifa_amount: number
  company_amount: number
  currency: string
  status: string
  ifas: { id: string; code: string; name: string } | null
  policies: { policy_number: string; policy_holder_name: string } | null
}

type BulkAction = 'approve' | 'reject' | null

export default function ApprovalsPage() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchIFA, setSearchIFA] = useState('')
  const [actioning, setActioning] = useState(false)
  const [feedback, setFeedback] = useState('')

  // Tracks the last-clicked row index for Shift+click range selection
  const lastClickedIdx = useRef<number>(-1)

  // Override modal
  const [overrideId, setOverrideId] = useState<string | null>(null)
  const [overrideAmount, setOverrideAmount] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideError, setOverrideError] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const authHeaders = await getAuthHeaders()
    const res = await fetch('/api/commission/approvals', { headers: authHeaders })
    const { transactions: data } = await res.json()
    setTransactions(data ?? [])
    setSelected(new Set())
    lastClickedIdx.current = -1
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Refresh when tab regains focus (e.g. after deleting from Master File in another tab)
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = transactions.filter(t => {
    if (!searchIFA) return true
    const q = searchIFA.toLowerCase()
    return (
      t.ifas?.name.toLowerCase().includes(q) ||
      t.ifas?.code.toLowerCase().includes(q) ||
      t.policies?.policy_number.toLowerCase().includes(q)
    )
  })

  // ── Selection helpers ────────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleAll = () =>
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(t => t.id)))

  const selectAll = () => setSelected(new Set(filtered.map(t => t.id)))

  const clearSelection = () => { setSelected(new Set()); lastClickedIdx.current = -1 }

  // Shift+click: select all rows between the anchor and the clicked row
  const handleCheckboxClick = (id: string, idx: number, e: React.MouseEvent<HTMLInputElement>) => {
    if (e.shiftKey && lastClickedIdx.current >= 0) {
      const start = Math.min(lastClickedIdx.current, idx)
      const end = Math.max(lastClickedIdx.current, idx)
      setSelected(prev => {
        const s = new Set(prev)
        filtered.slice(start, end + 1).forEach(t => s.add(t.id))
        return s
      })
      // Anchor stays fixed on Shift+click (standard spreadsheet behaviour)
    } else {
      toggleSelect(id)
      lastClickedIdx.current = idx
    }
  }

  // ── Bulk action ──────────────────────────────────────────────────────────────
  const handleBulk = async (action: BulkAction) => {
    if (!action || selected.size === 0) return
    setActioning(true)
    const authHeaders = await getAuthHeaders()
    const res = await fetch('/api/commission/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ ids: [...selected], action }),
    })
    const data = await res.json()
    setActioning(false)
    if (res.ok) {
      setFeedback(`${action === 'approve' ? 'Approved' : 'Rejected'} ${data.updated} transactions.`)
      setTimeout(() => setFeedback(''), 5000)
      await load()
    } else {
      setFeedback(`Error: ${data.error}`)
      setTimeout(() => setFeedback(''), 5000)
    }
  }

  // ── Single action ────────────────────────────────────────────────────────────
  const handleSingle = async (id: string, action: 'approve' | 'reject') => {
    const authHeaders = await getAuthHeaders()
    const res = await fetch(`/api/commission/approvals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ action }),
    })
    if (res.ok) await load()
  }

  // ── Override ─────────────────────────────────────────────────────────────────
  const openOverride = (t: Transaction) => {
    setOverrideId(t.id)
    setOverrideAmount(String(t.ifa_amount))
    setOverrideReason('')
    setOverrideError('')
  }

  const handleOverride = async () => {
    if (!overrideId) return
    const amt = parseFloat(overrideAmount)
    if (isNaN(amt) || amt < 0) { setOverrideError('Enter a valid amount'); return }
    setOverrideSaving(true)
    const authHeaders = await getAuthHeaders()
    const res = await fetch(`/api/commission/approvals/${overrideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ action: 'override', ifa_amount: amt, override_reason: overrideReason }),
    })
    const data = await res.json()
    setOverrideSaving(false)
    if (res.ok) {
      setOverrideId(null)
      await load()
    } else {
      setOverrideError(data.error)
    }
  }

  // ── Currency display ─────────────────────────────────────────────────────────
  const fmt = (amount: number, currency: string) => formatCurrency(amount, currency || 'USD')

  // ── Totals ───────────────────────────────────────────────────────────────────
  const selectedTransactions = filtered.filter(t => selected.has(t.id))
  const selectedTotal = selectedTransactions.reduce((s, t) => s + (t.ifa_amount ?? 0), 0)

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">

        <button
          onClick={() => router.push('/commission/admin')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[var(--wgi-navy)] font-medium transition-colors"
        >
          ← Back to Admin
        </button>

        {/* Feedback */}
        {feedback && (
          <div className={`${feedback.startsWith('Error:') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'} border px-4 py-3 rounded-md text-sm`}>
            {feedback}
          </div>
        )}

        {/* Toolbar */}
        <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-col gap-3">
          {/* Row 1: filter + count + quick-select + bulk actions */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1 items-start sm:items-center">
              <input
                type="text"
                placeholder="Filter by IFA or policy…"
                value={searchIFA}
                onChange={e => { setSearchIFA(e.target.value); lastClickedIdx.current = -1 }}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm w-60 focus:ring-2 focus:ring-[var(--wgi-gold)]"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-gray-500">
                  {filtered.length} pending · {selected.size} selected
                  {selected.size > 0 && ` · ${fmt(selectedTotal, 'USD')} IFA total`}
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={selectAll}
                    disabled={filtered.length === 0}
                    className="text-[var(--wgi-navy)] hover:underline disabled:opacity-40"
                  >
                    Select All
                  </button>
                  {selected.size > 0 && (
                    <button onClick={clearSelection} className="text-gray-500 hover:underline">
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {selected.size > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleBulk('approve')}
                  disabled={actioning}
                  className="px-4 py-2 bg-[var(--wgi-navy)] text-white rounded-md text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40"
                >
                  {actioning ? '…' : `Approve ${selected.size}`}
                </button>
                <button
                  onClick={() => handleBulk('reject')}
                  disabled={actioning}
                  className="px-4 py-2 bg-white text-[var(--cm-status-rejected-text)] border border-gray-300 rounded-md text-sm font-medium hover:border-[var(--cm-status-rejected-text)] disabled:opacity-40"
                >
                  {actioning ? '…' : `Reject ${selected.size}`}
                </button>
              </div>
            )}
          </div>

          {/* Row 2: hint */}
          <p className="text-xs text-gray-400">
            Hold{' '}
            <kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 font-mono text-xs">Shift</kbd>
            {' '}and click a checkbox to select a range. Use <strong>Select All</strong> to select all filtered rows at once.
          </p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 font-medium">No pending commissions</p>
              <p className="text-sm text-gray-400 mt-1">Run "Calculate Commissions" on the master file to generate transactions.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-[var(--wgi-navy)]">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={toggleAll}
                        className="rounded border-gray-300 text-blue-600"
                      />
                    </th>
                    {['IFA', 'Policy', 'Holder', 'Type', 'Date', 'Gross', 'IFA Amount', 'Company', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-white/85 uppercase tracking-[0.1em]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filtered.map((t, idx) => (
                    <tr key={t.id} className={selected.has(t.id) ? 'bg-[#eef3f9]' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => {}}
                          onClick={(e) => handleCheckboxClick(t.id, idx, e)}
                          className="rounded border-gray-300 text-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <span className="cm-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{t.ifas?.code}</span>
                        <div className="text-xs text-gray-500">{t.ifas?.name}</div>
                      </td>
                      <td className="px-4 py-3 cm-mono text-xs">{t.policies?.policy_number ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{t.policies?.policy_holder_name ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{t.commission_type_code || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 cm-mono font-medium text-gray-900">{fmt(t.gross_amount, t.currency)}</td>
                      <td className="px-4 py-3 cm-mono font-medium text-[var(--cm-gain)]">{fmt(t.ifa_amount, t.currency)}</td>
                      <td className="px-4 py-3 cm-mono text-gray-600">{fmt(t.company_amount, t.currency)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <button
                            onClick={() => handleSingle(t.id, 'approve')}
                            className="text-xs text-[var(--cm-status-approved-text)] hover:underline font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleSingle(t.id, 'reject')}
                            className="text-xs text-[var(--cm-status-rejected-text)] hover:underline"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => openOverride(t)}
                            className="text-xs text-[var(--wgi-navy)] hover:underline"
                          >
                            Override
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Override Modal ─────────────────────────────────────────────────── */}
      {overrideId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Override IFA Amount</h2>
            <p className="text-sm text-gray-500">The original calculated amount will be replaced.</p>

            {overrideError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {overrideError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New IFA Amount</label>
              <input
                type="number"
                step="0.01"
                value={overrideAmount}
                onChange={e => setOverrideAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--wgi-gold)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                rows={2}
                placeholder="Explain the reason for the override…"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--wgi-gold)]"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setOverrideId(null)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-md text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleOverride}
                disabled={overrideSaving}
                className="flex-1 bg-[var(--wgi-navy)] text-white py-2 rounded-md text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40"
              >
                {overrideSaving ? 'Saving…' : 'Apply Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
