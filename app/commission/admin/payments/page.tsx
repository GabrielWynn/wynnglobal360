'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'

interface IFASummary {
  ifa: { id: string; code: string; name: string; email: string; advisor_notes: string | null }
  totals: Record<string, number>
  countsByCurrency: Record<string, number>
  transactionIds: string[]
}

interface PaymentBatch {
  id: string
  ifa: { id: string; code: string; name: string; email: string }
  total_amount: number
  currency: string
  payment_reference: string | null
  payment_date: string
  transaction_count: number
  status: string
}

interface PayModal {
  summary: IFASummary
  currency: string
  amount: number
}

export default function PaymentsPage() {
  const router = useRouter()
  const [summaries, setSummaries] = useState<IFASummary[]>([])
  const [batches, setBatches] = useState<PaymentBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Payment modal
  const [payModal, setPayModal] = useState<PayModal | null>(null)
  const [payRef, setPayRef] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [feedback, setFeedback] = useState('')

  // Notes panel state: maps ifa_code → { open, draft, saving }
  const [notesState, setNotesState] = useState<Record<string, { open: boolean; draft: string; saving: boolean }>>({})

  const toggleNotes = (code: string, currentNotes: string | null) => {
    setNotesState(prev => {
      const existing = prev[code]
      if (existing) return { ...prev, [code]: { ...existing, open: !existing.open } }
      return { ...prev, [code]: { open: true, draft: currentNotes ?? '', saving: false } }
    })
  }

  const setNotesDraft = (code: string, value: string) => {
    setNotesState(prev => ({ ...prev, [code]: { ...prev[code], draft: value } }))
  }

  const saveNotes = useCallback(async (code: string) => {
    const draft = notesState[code]?.draft ?? ''
    setNotesState(prev => ({ ...prev, [code]: { ...prev[code], saving: true } }))
    const authHeaders = await getAuthHeaders()
    await fetch('/api/commission/ifa-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ ifa_code: code, notes: draft || null }),
    })
    setNotesState(prev => ({ ...prev, [code]: { ...prev[code], saving: false } }))
    // Update local summary so the saved value persists without a full reload
    setSummaries(prev => prev.map(s =>
      s.ifa.code === code ? { ...s, ifa: { ...s.ifa, advisor_notes: draft || null } } : s
    ))
  }, [notesState])

  const load = useCallback(async () => {
    setLoading(true)
    const authHeaders = await getAuthHeaders()
    const [summaryRes, historyRes] = await Promise.all([
      fetch('/api/commission/payments', { headers: authHeaders }),
      fetch('/api/commission/payments/history', { headers: authHeaders }),
    ])
    const { summaries: summaryData } = await summaryRes.json()
    const { batches: batchData } = await historyRes.json()
    setSummaries(summaryData ?? [])
    setBatches(batchData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Refresh when tab regains focus (e.g. after approving records in Master File in another tab)
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // Real-time sync: broadcast advisor_notes changes to all connected admins instantly
  useEffect(() => {
    const channel = supabase
      .channel('ifas-advisor-notes-sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ifas' },
        (payload) => {
          const { code, advisor_notes } = payload.new as { code: string; advisor_notes: string | null }
          // Always update the persisted value in summaries (refreshes the indicator dot too)
          setSummaries(prev => prev.map(s =>
            s.ifa.code === code ? { ...s, ifa: { ...s.ifa, advisor_notes } } : s
          ))
          // Sync the draft only when the notes panel is closed — never overwrite an active edit
          setNotesState(prev => {
            const entry = prev[code]
            if (!entry || entry.open) return prev
            return { ...prev, [code]: { ...entry, draft: advisor_notes ?? '' } }
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const filtered = summaries.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.ifa.name.toLowerCase().includes(q) || s.ifa.code.toLowerCase().includes(q)
  })

  const openPayModal = (summary: IFASummary, currency: string) => {
    setPayModal({ summary, currency, amount: summary.totals[currency] ?? 0 })
    setPayRef('')
    setPayDate(new Date().toISOString().split('T')[0])
    setPayError('')
  }

  const handlePay = async () => {
    if (!payModal) return
    setPaying(true)
    setPayError('')

    const authHeaders = await getAuthHeaders()
    const res = await fetch('/api/commission/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        ifa_id: payModal.summary.ifa.id,
        payment_reference: payRef || null,
        payment_date: payDate,
        currency: payModal.currency,
      }),
    })

    const data = await res.json()
    setPaying(false)

    if (!res.ok) {
      setPayError(data.error)
      return
    }

    setPayModal(null)
    setFeedback(`Payment of ${formatCurrency(data.total_amount, payModal.currency)} to ${payModal.summary.ifa.name} recorded (${data.transactions_paid} transactions).`)
    setTimeout(() => setFeedback(''), 6000)
    await load()
  }

  return (
    <div className="min-h-[calc(100vh-105px)]" style={{ background: 'var(--wgi-bg)' }}>
      <main className="px-6 py-5 space-y-6">

        {/* Feedback */}
        {feedback && (
          <div className="rounded-[6px] border border-[var(--cm-status-approved-text)]/30 bg-[var(--cm-status-approved-bg)] px-4 py-2.5 text-xs font-semibold text-[var(--cm-status-approved-text)]">
            {feedback}
          </div>
        )}

        {/* ── Section 1: IFAs Ready to Pay ──────────────────────────────────── */}
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <h1 className="text-[18px] font-bold text-[var(--wgi-navy)]">IFAs Ready to Pay</h1>
              <p className="mt-0.5 text-[11px] font-medium text-[var(--wgi-text-muted)]">Approved balances awaiting payment</p>
            </div>
            <input
              type="text"
              placeholder="Search IFA name or code…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 w-56 rounded-[4px] border border-[var(--wgi-border)] px-3 text-xs outline-none focus:border-[var(--wgi-gold)] focus:ring-2 focus:ring-[var(--wgi-gold)]/20"
            />
          </div>

          {loading ? (
            <div className="bg-[var(--wgi-surface)] rounded-[6px] border border-[var(--wgi-border)] p-12 text-center text-gray-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="bg-[var(--wgi-surface)] rounded-[6px] border border-[var(--wgi-border)] p-10 text-center">
              <p className="text-gray-500 font-medium">No approved balances</p>
              <p className="text-sm text-gray-400 mt-1">Approve transactions on the Approvals page first.</p>
              <button
                onClick={() => router.push('/commission/admin/approvals')}
                className="mt-4 text-sm text-[var(--wgi-navy)] hover:underline"
              >
                Go to Approvals →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(summary => (
                <div key={summary.ifa.id} className="bg-[var(--wgi-surface)] rounded-[6px] border border-[var(--wgi-border)] p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{summary.ifa.name}</p>
                      <p className="text-xs text-gray-500 cm-mono">{summary.ifa.code}</p>
                      <p className="text-xs text-gray-400">{summary.ifa.email}</p>
                    </div>
                    <span className="bg-[var(--wgi-bg)] text-[var(--wgi-text-muted)] text-xs font-semibold px-2 py-0.5 rounded-full">
                      {summary.transactionIds.length} txns
                    </span>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(summary.totals).map(([currency, amount]) => (
                      <div key={currency} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2">
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">{currency}</span>
                          <p className={`font-bold text-lg cm-mono ${amount < 0 ? 'text-[var(--cm-loss)]' : 'text-gray-900'}`}>
                            {formatCurrency(amount, currency)}
                          </p>
                        </div>
                        {amount > 0 ? (
                          <button
                            onClick={() => openPayModal(summary, currency)}
                            className="bg-[var(--wgi-navy)] text-white text-sm px-3 py-1.5 rounded-md font-medium hover:bg-[var(--wgi-navy-600)]"
                          >
                            Mark Paid
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 italic px-2">
                            {amount < 0 ? 'Negative balance' : 'No balance'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {Object.keys(summary.totals).length > 1 && (
                    <p className="text-xs text-gray-400 text-right">
                      Multiple currencies — pay each separately
                    </p>
                  )}

                  {/* Advisor Notes */}
                  <div className="border-t border-gray-100 pt-3">
                    <button
                      onClick={() => toggleNotes(summary.ifa.code, summary.ifa.advisor_notes)}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      <svg className={`w-3.5 h-3.5 transition-transform ${notesState[summary.ifa.code]?.open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Notes
                      {summary.ifa.advisor_notes && !notesState[summary.ifa.code]?.open && (
                        <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" title="Has notes" />
                      )}
                    </button>

                    {notesState[summary.ifa.code]?.open && (
                      <div className="mt-2 space-y-1.5">
                        <textarea
                          value={notesState[summary.ifa.code]?.draft ?? summary.ifa.advisor_notes ?? ''}
                          onChange={e => setNotesDraft(summary.ifa.code, e.target.value)}
                          onBlur={() => saveNotes(summary.ifa.code)}
                          placeholder="Thresholds, key details, reminders…"
                          rows={4}
                          className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-[var(--wgi-gold)] bg-amber-50 placeholder-gray-400"
                        />
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-400">Saved automatically on blur</p>
                          {notesState[summary.ifa.code]?.saving && (
                            <p className="text-xs text-[var(--wgi-navy)]">Saving…</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Section 2: Paid This Month ─────────────────────────────────────── */}
        <section>
          <div className="mb-3">
            <h2 className="text-[15px] font-bold text-[var(--wgi-navy)]">Paid This Month</h2>
            <p className="mt-0.5 text-[11px] font-medium text-[var(--wgi-text-muted)]">
              {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })} payment history
            </p>
          </div>

          {loading ? (
            <div className="bg-[var(--wgi-surface)] rounded-[6px] border border-[var(--wgi-border)] p-8 text-center text-gray-500">Loading…</div>
          ) : batches.length === 0 ? (
            <div className="bg-[var(--wgi-surface)] rounded-[6px] border border-[var(--wgi-border)] p-8 text-center">
              <p className="text-gray-500 font-medium">No payments recorded this month</p>
            </div>
          ) : (
            <div className="bg-[var(--wgi-surface)] rounded-[6px] border border-[var(--wgi-border)] overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-[var(--wgi-navy)]">
                  <tr>
                    {['IFA', 'Amount', 'Transactions', 'Payment Date', 'Reference'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-white/85 uppercase tracking-[0.1em]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {batches.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-gray-900">{b.ifa.name}</p>
                        <p className="text-xs text-gray-400 cm-mono">{b.ifa.code}</p>
                      </td>
                      <td className="px-3 py-2.5 font-semibold cm-mono text-[var(--cm-gain)]">
                        {formatCurrency(b.total_amount, b.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{b.transaction_count}</td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {new Date(b.payment_date).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 cm-mono text-xs">
                        {b.payment_reference ?? <span className="italic text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-2 text-xs font-medium text-gray-500">{batches.length} payment{batches.length !== 1 ? 's' : ''}</td>
                    <td className="px-4 py-2 text-sm font-bold cm-mono text-[var(--cm-gain)]">
                      {/* Sum per currency */}
                      {Object.entries(
                        batches.reduce<Record<string, number>>((acc, b) => {
                          acc[b.currency] = (acc[b.currency] ?? 0) + b.total_amount
                          return acc
                        }, {})
                      ).map(([cur, total]) => (
                        <span key={cur} className="mr-3">{formatCurrency(total, cur)}</span>
                      ))}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

      </main>

      {/* ── Payment Confirmation Modal ──────────────────────────────────────── */}
      {payModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--wgi-surface)] rounded-[6px] border border-[var(--wgi-border)]-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Confirm Payment</h2>

            <div className="bg-gray-50 rounded-md p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">IFA</span>
                <span className="font-medium">{payModal.summary.ifa.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-bold text-lg cm-mono text-[var(--cm-gain)]">
                  {formatCurrency(payModal.amount, payModal.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Transactions</span>
                <span>
                  {payModal.summary.countsByCurrency?.[payModal.currency] ?? payModal.summary.transactionIds.length}
                </span>
              </div>
            </div>

            {payError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {payError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
              <input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Reference <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={payRef}
                onChange={e => setPayRef(e.target.value)}
                placeholder="Bank ref, wire number, etc."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--wgi-gold)]"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setPayModal(null)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-md text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePay}
                disabled={paying}
                className="flex-1 bg-[var(--wgi-navy)] text-white py-2 rounded-md text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40"
              >
                {paying ? 'Processing…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
