'use client'

/**
 * Agent Adjustments — read-only ledger of lump-sum "Agent Adjustments"
 * payments (no policy number, imported as-is from a statement).
 *
 * Each row's Due WG rows are allocated from the Master File (click a
 * row's "Allocate" button in the WG Alloc column), not from here — this
 * page exists so every adjustment stays visible for audit, including
 * ones that have already dropped out of the allocation picker because
 * they're fully resolved.
 *
 * Due = -(sum of that adjustment's allocated rows still Pending).
 * Falls to 0 only once every allocated row has been manually confirmed Paid.
 */

import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from '@/lib/supabase'

interface AllocatedRow {
  id: string
  policy_number: string
  ifa_name: string | null
  due_wg: number
  due_wg_status: string
  transaction_date: string
}

interface Adjustment {
  id: string
  amount: number
  currency: string
  transaction_date: string
  status: string
  platform: { name: string } | null
  upload_batch: { filename: string } | null
  allocated: AllocatedRow[]
  paidTotal: number
  pendingTotal: number
  due: number
  remainder: number
}

function fmtMoney(v: number, currency = 'USD') {
  const sign = v < 0 ? '-' : ''
  return `${sign}$${Math.abs(v).toFixed(2)} ${currency}`
}

export default function AgentAdjustmentsPage() {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: adjRows, error: adjErr } = await supabase
        .from('commission_records')
        .select('id, amount, currency, transaction_date, status, platform:platforms(name), upload_batch:csv_upload_batches(filename)')
        .eq('is_agent_adjustment', true)
        .eq('is_deleted', false)
        .order('transaction_date', { ascending: false })
      if (adjErr) throw new Error(adjErr.message)

      const adjIds = (adjRows ?? []).map(r => r.id)
      let allocatedRows: any[] = []
      if (adjIds.length > 0) {
        const { data, error: allocErr } = await supabase
          .from('commission_records')
          .select('id, policy_number, ifa_name, due_wg, due_wg_status, transaction_date, agent_adjustment_id')
          .in('agent_adjustment_id', adjIds)
        if (allocErr) throw new Error(allocErr.message)
        allocatedRows = data ?? []
      }

      const byAdjustment = new Map<string, AllocatedRow[]>()
      for (const r of allocatedRows) {
        const list = byAdjustment.get(r.agent_adjustment_id) ?? []
        list.push(r)
        byAdjustment.set(r.agent_adjustment_id, list)
      }

      const built: Adjustment[] = (adjRows ?? []).map((r: any) => {
        const allocated: AllocatedRow[] = byAdjustment.get(r.id) ?? []
        const paidTotal = allocated.filter(a => a.due_wg_status === 'paid').reduce((s, a) => s + Number(a.due_wg ?? 0), 0)
        const pendingTotal = allocated.filter(a => a.due_wg_status !== 'paid').reduce((s, a) => s + Number(a.due_wg ?? 0), 0)
        return {
          id: r.id,
          amount: r.amount ?? 0,
          currency: r.currency,
          transaction_date: r.transaction_date,
          status: r.status,
          platform: r.platform ?? null,
          upload_batch: r.upload_batch ?? null,
          allocated,
          paidTotal,
          pendingTotal,
          due: -pendingTotal,
          remainder: (r.amount ?? 0) - paidTotal,
        }
      })

      setAdjustments(built)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = adjustments.filter(a => showResolved || a.remainder > 0.005)
  const openCount = adjustments.filter(a => a.remainder > 0.005).length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--wgi-navy)] mx-auto" />
          <p className="mt-4 text-gray-600">Loading agent adjustments…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-105px)]" style={{ background: 'var(--wgi-bg)' }}>
      <main className="px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-bold text-[var(--wgi-navy)]">Agent Adjustments</h1>
            <p className="mt-0.5 text-[11px] font-medium text-[var(--wgi-text-muted)]">
              {openCount === 0
                ? 'Every lump-sum adjustment is fully accounted for'
                : `${openCount} adjustment${openCount === 1 ? '' : 's'} not yet fully explained`}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--wgi-text-muted)]">
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
            Show fully resolved
          </label>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2.5 rounded-md text-sm">{error}</div>
        )}

        {visible.length === 0 ? (
          <div className="bg-[var(--wgi-surface)] rounded-[6px] border border-[var(--wgi-border)] p-12 text-center">
            <div className="text-green-500 text-5xl mb-3">✓</div>
            <p className="text-lg font-medium text-gray-700">Nothing to allocate</p>
            <p className="text-sm text-gray-500 mt-1">No open Agent Adjustments right now.</p>
          </div>
        ) : (
          <div className="bg-[var(--wgi-surface)] rounded-[6px] border border-[var(--wgi-border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-[var(--wgi-navy)]">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-white/85 uppercase tracking-[0.1em] w-6"></th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-white/85 uppercase tracking-[0.1em]">Received</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-white/85 uppercase tracking-[0.1em]">Due</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-white/85 uppercase tracking-[0.1em]">Allocated</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-white/85 uppercase tracking-[0.1em]">Platform</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-white/85 uppercase tracking-[0.1em]">Source File</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-white/85 uppercase tracking-[0.1em]">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map(a => {
                    const isOpen = expandedId === a.id
                    const resolved = a.remainder <= 0.005
                    return (
                      <Fragment key={a.id}>
                        <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(isOpen ? null : a.id)}>
                          <td className="px-3 py-2.5 text-gray-400 font-bold">{a.allocated.length > 0 ? (isOpen ? '▼' : '▶') : ''}</td>
                          <td className="px-3 py-2.5 cm-mono font-semibold text-gray-900">{fmtMoney(a.amount, a.currency)}</td>
                          <td className="px-3 py-2.5 cm-mono font-semibold" style={{ color: resolved ? 'var(--cm-status-paid-text)' : 'var(--cm-status-pending-text)' }}>
                            {fmtMoney(a.due, a.currency)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.06em] uppercase"
                              style={{
                                background: resolved ? 'var(--cm-status-paid-bg)' : 'var(--cm-status-pending-bg)',
                                color: resolved ? 'var(--cm-status-paid-text)' : 'var(--cm-status-pending-text)',
                              }}
                            >
                              {resolved ? 'Resolved' : `${a.allocated.length} row${a.allocated.length === 1 ? '' : 's'} tagged`}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{a.platform?.name || <span className="text-gray-400">—</span>}</td>
                          <td className="px-3 py-2.5 text-gray-600">{a.upload_batch?.filename || <span className="text-gray-400">— manual entry —</span>}</td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap cm-mono">{a.transaction_date}</td>
                        </tr>
                        {isOpen && a.allocated.length > 0 && (
                          <tr>
                            <td colSpan={7} className="px-3 py-0 bg-[var(--wgi-bg)]">
                              <table className="w-full text-xs my-2">
                                <thead>
                                  <tr className="text-[10px] uppercase tracking-[0.08em] text-[var(--wgi-text-muted)]">
                                    <th className="text-left py-1 px-2">Policy</th>
                                    <th className="text-left py-1 px-2">IFA</th>
                                    <th className="text-left py-1 px-2">Due WG</th>
                                    <th className="text-left py-1 px-2">Status</th>
                                    <th className="text-left py-1 px-2">Date</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {a.allocated.map(row => (
                                    <tr key={row.id}>
                                      <td className="py-1 px-2 cm-mono">{row.policy_number}</td>
                                      <td className="py-1 px-2">{row.ifa_name ?? '—'}</td>
                                      <td className="py-1 px-2 cm-mono">{fmtMoney(Number(row.due_wg ?? 0), a.currency)}</td>
                                      <td className="py-1 px-2">
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-[0.06em] uppercase"
                                          style={{
                                            background: row.due_wg_status === 'paid' ? 'var(--cm-status-paid-bg)' : 'var(--cm-status-pending-bg)',
                                            color: row.due_wg_status === 'paid' ? 'var(--cm-status-paid-text)' : 'var(--cm-status-pending-text)',
                                          }}
                                        >
                                          {row.due_wg_status}
                                        </span>
                                      </td>
                                      <td className="py-1 px-2 cm-mono">{row.transaction_date}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
