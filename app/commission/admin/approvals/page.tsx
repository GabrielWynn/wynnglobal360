'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
    <div className="flex min-h-[calc(100vh-105px)] flex-col" style={{ background: 'var(--wgi-bg)' }}>
      <div className="flex-1 px-6 py-5">

        {/* Feedback */}
        {feedback && (
          <div className={`${feedback.startsWith('Error:') ? 'border-[var(--cm-alert-critical-border)] bg-[var(--cm-alert-critical-bg)] text-[var(--cm-alert-critical-text)]' : 'border-[var(--cm-status-approved-text)]/30 bg-[var(--cm-status-approved-bg)] text-[var(--cm-status-approved-text)]'} mb-4 rounded-[6px] border px-4 py-2.5 text-xs font-semibold`}>
            {feedback}
          </div>
        )}

        {/* Title + filter */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-bold text-[var(--wgi-navy)]">Approvals</h1>
            <p className="mt-0.5 text-[11px] font-medium text-[var(--wgi-text-muted)]">
              {filtered.length} transaction{filtered.length === 1 ? '' : 's'} pending review
              {filtered.length > 0 && ` · ${fmt(filtered.reduce((s, t) => s + (t.ifa_amount ?? 0), 0), 'USD')} IFA value`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Filter by IFA or policy…"
              value={searchIFA}
              onChange={e => { setSearchIFA(e.target.value); lastClickedIdx.current = -1 }}
              className="h-8 w-60 rounded-[4px] border border-[var(--wgi-border)] px-3 text-xs outline-none focus:border-[var(--wgi-gold)] focus:ring-2 focus:ring-[var(--wgi-gold)]/20"
            />
            <button
              onClick={selectAll}
              disabled={filtered.length === 0}
              className="h-8 whitespace-nowrap rounded-[4px] border border-[var(--wgi-border)] bg-white px-3 text-xs font-semibold text-[var(--wgi-navy)] hover:border-[var(--wgi-navy)] disabled:opacity-40"
            >
              Select all
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="rounded-[6px] border border-[var(--wgi-border)] bg-[var(--wgi-surface)] p-12 text-center text-sm text-[var(--wgi-text-light)]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[6px] border border-[var(--wgi-border)] bg-[var(--wgi-surface)] p-12 text-center">
            <p className="font-medium text-[var(--wgi-text-muted)]">No pending commissions</p>
            <p className="mt-1 text-xs text-[var(--wgi-text-light)]">Run &quot;Calculate Commissions&quot; on the master file to generate transactions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[6px] border border-[var(--wgi-border)] bg-[var(--wgi-surface)]">
            <table className="min-w-full text-[12px]">
              <thead className="bg-[var(--wgi-navy)]">
                <tr>
                  <th className="w-8 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="checkbox cursor-pointer align-middle"
                    />
                  </th>
                  {[
                    { h: 'IFA' }, { h: 'Policy' }, { h: 'Holder' }, { h: 'Type' }, { h: 'Date' },
                    { h: 'Gross', right: true }, { h: 'IFA Amount', right: true }, { h: 'Company', right: true }, { h: 'Actions' },
                  ].map(({ h, right }) => (
                    <th key={h} className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/85 ${right ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, idx) => (
                  <tr
                    key={t.id}
                    className={`border-b border-[var(--wgi-border)] transition-colors ${selected.has(t.id) ? 'bg-[#eef3f9]' : 'hover:bg-[var(--wgi-bg)]'}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => {}}
                        onClick={(e) => handleCheckboxClick(t.id, idx, e)}
                        className="checkbox cursor-pointer align-middle"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className="cm-mono rounded bg-[var(--wgi-bg)] px-1 py-0.5 text-[11px] font-semibold text-[var(--wgi-navy)]">{t.ifas?.code}</span>
                      <div className="text-[11px] text-[var(--wgi-text-muted)]">{t.ifas?.name}</div>
                    </td>
                    <td className="cm-mono px-3 py-2 text-[11px] text-[var(--wgi-text-muted)]">{t.policies?.policy_number ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--wgi-text)]">{t.policies?.policy_holder_name ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--wgi-text-muted)]">{t.commission_type_code || '—'}</td>
                    <td className="cm-mono px-3 py-2 text-[11px] text-[var(--wgi-text-muted)]">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</td>
                    <td className="cm-mono px-3 py-2 text-right font-medium text-[var(--wgi-text)]">{fmt(t.gross_amount, t.currency)}</td>
                    <td className="cm-mono px-3 py-2 text-right font-medium text-[var(--cm-gain)]">{fmt(t.ifa_amount, t.currency)}</td>
                    <td className="cm-mono px-3 py-2 text-right text-[var(--wgi-text-muted)]">{fmt(t.company_amount, t.currency)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <button onClick={() => handleSingle(t.id, 'approve')} className="text-[11px] font-medium text-[var(--cm-status-approved-text)] hover:underline">Approve</button>
                        <button onClick={() => handleSingle(t.id, 'reject')} className="text-[11px] text-[var(--cm-status-rejected-text)] hover:underline">Reject</button>
                        <button onClick={() => openOverride(t)} className="text-[11px] text-[var(--wgi-navy)] hover:underline">Override</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Hint */}
        <p className="mt-2 text-[11px] text-[var(--wgi-text-light)]">
          Hold <kbd className="cm-mono rounded border border-[var(--wgi-border)] bg-[var(--wgi-bg)] px-1 py-0.5 text-[10px]">Shift</kbd> and click a checkbox to select a range.
        </p>
      </div>

      {/* Sticky bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 flex items-center gap-3 border-t border-[var(--wgi-border)] bg-[var(--wgi-surface)] px-6 py-3" style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.04)' }}>
          <span className="text-[12px] font-semibold text-[var(--wgi-navy)]">
            {selected.size} selected · {fmt(selectedTotal, 'USD')} IFA total
          </span>
          <div className="ml-auto flex gap-2">
            <button onClick={clearSelection} className="rounded-[4px] border border-[var(--wgi-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--wgi-text)] hover:border-[var(--wgi-navy)]">
              Clear
            </button>
            <button
              onClick={() => handleBulk('reject')}
              disabled={actioning}
              className="rounded-[4px] border border-[var(--wgi-border)] bg-white px-4 py-1.5 text-xs font-semibold text-[var(--cm-status-rejected-text)] hover:border-[var(--cm-status-rejected-text)] disabled:opacity-40"
            >
              {actioning ? '…' : `Reject ${selected.size}`}
            </button>
            <button
              onClick={() => handleBulk('approve')}
              disabled={actioning}
              className="rounded-[4px] bg-[var(--wgi-navy)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--wgi-navy-600)] disabled:opacity-40"
            >
              {actioning ? '…' : `Approve ${selected.size}`}
            </button>
          </div>
        </div>
      )}

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
