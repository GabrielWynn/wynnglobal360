'use client'

import { useState, useEffect, useCallback } from 'react'
import { getAuthHeaders } from '@/lib/supabase'

interface AuditEntry {
  id: string
  record_id: string
  policy_number: string | null
  action: string
  changes: Record<string, { old: string | null; new: string | null }> | null
  changed_by: string | null
  user_email: string | null
  created_at: string
}

// Commission status palette (DESIGN-COMMISSION.md --cm-status-*).
const ACTION_COLOURS: Record<string, string> = {
  'commission.approve':       'bg-[var(--cm-status-approved-bg)]  text-[var(--cm-status-approved-text)]',
  'commission.reject':        'bg-[var(--cm-status-rejected-bg)]  text-[var(--cm-status-rejected-text)]',
  'commission.override':      'bg-[var(--cm-status-advance-bg)]   text-[var(--cm-status-advance-text)]',
  'commission.pay':           'bg-[var(--cm-status-paid-bg)]      text-[var(--cm-status-paid-text)]',
  'commission.reconcile':     'bg-[var(--cm-status-suspended-bg)] text-[var(--cm-status-suspended-text)]',
  'commission.config_update': 'bg-[var(--wgi-bg)] text-[var(--wgi-text-muted)]',
}

const FIELD_LABELS: Record<string, string> = {
  amount: 'Amount', variable_amount: 'Variable', ifa_percentage: 'IFA %',
  suspense_percentage: 'Suspense %', wgi_percentage: 'WGI %',
  ifa_amount: 'IFA Amount', suspense_amount: 'Suspense Amt', wg_amount: 'WG Amount',
  due_wg: 'Due WG', paid: 'Paid', unpaid: 'Unpaid', status: 'Status',
  notes: 'Notes', ifa_notes: 'IFA Notes', rate: 'Rate',
  ape: 'APE IFA', ape_wgi: 'APE WGI', is_deleted: 'Deleted',
  ifa_id: 'IFA', platform_id: 'Platform', commission_type: 'Comm. Type',
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const dd  = String(d.getDate()).padStart(2, '0')
  const mm  = String(d.getMonth() + 1).padStart(2, '0')
  const yy  = String(d.getFullYear()).slice(2)
  const hh  = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yy} ${hh}:${min}`
}

export default function AuditLogPage() {
  const [logs,        setLogs]        = useState<AuditEntry[]>([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())

  // Filters
  const [policy,  setPolicy]  = useState('')
  const [action,  setAction]  = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const PAGE_SIZE = 100

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const params = new URLSearchParams({ page: String(p) })
      if (policy)   params.set('policy',  policy)
      if (action)   params.set('action',  action)
      if (dateFrom) params.set('from',    dateFrom)
      if (dateTo)   params.set('to',      dateTo)

      const res  = await fetch(`/api/commission/audit?${params}`, { headers })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load')
      setLogs(json.logs)
      setTotal(json.total)
      setPage(p)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [policy, action, dateFrom, dateTo])

  useEffect(() => { load(1) }, []) // eslint-disable-line

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="min-h-[calc(100vh-105px)]" style={{ background: 'var(--wgi-bg)' }}>

      <main className="px-6 py-5 space-y-4">

        <div>
          <h1 className="text-[18px] font-bold text-[var(--wgi-navy)]">Audit Log</h1>
          <p className="mt-0.5 text-[11px] font-medium text-[var(--wgi-text-muted)]">Every change is recorded</p>
        </div>

        {/* Filters */}
        <div className="bg-[var(--wgi-surface)] rounded-[6px] border border-[var(--wgi-border)] px-4 py-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Policy</label>
            <input
              value={policy}
              onChange={e => setPolicy(e.target.value)}
              placeholder="e.g. RS02050121"
              className="border border-gray-300 rounded px-2 py-1.5 text-sm w-44"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Action</label>
            <select
              value={action}
              onChange={e => setAction(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="commission.approve">Approve</option>
              <option value="commission.reject">Reject</option>
              <option value="commission.override">Override</option>
              <option value="commission.pay">Pay</option>
              <option value="commission.reconcile">Reconcile</option>
              <option value="commission.config_update">Config update</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>

          <button
            onClick={() => load(1)}
            className="bg-[var(--wgi-navy)] text-white px-4 py-1.5 rounded text-sm hover:bg-[var(--wgi-navy-600)]"
          >
            Search
          </button>
          <button
            onClick={() => { setPolicy(''); setAction(''); setDateFrom(''); setDateTo('') }}
            className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1.5"
          >
            Clear
          </button>

          <span className="ml-auto text-xs text-gray-400">{total.toLocaleString()} entries</span>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-2 text-sm">{error}</div>
        )}

        {/* Table */}
        <div className="bg-[var(--wgi-surface)] rounded-[6px] border border-[var(--wgi-border)] overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--wgi-navy)]">
              <tr>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/85 w-36">Date / Time</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/85 w-32">Policy</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/85 w-24">Action</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/85">Changes</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/85 w-44">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-gray-400 text-sm">Loading…</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-gray-400 text-sm">No entries found</td>
                </tr>
              ) : logs.map(log => {
                const isOpen    = expanded.has(log.id)
                const fields    = log.changes ? Object.keys(log.changes) : []
                const hasDetail = fields.length > 0

                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmtDateTime(log.created_at)}</td>
                    <td className="px-4 py-2 font-mono text-gray-800">{log.policy_number ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ACTION_COLOURS[log.action] ?? ''}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {!hasDetail ? (
                        <span className="text-gray-400 text-xs">—</span>
                      ) : (
                        <div>
                          {/* Collapsed: show first 3 fields inline */}
                          <div className="flex flex-wrap gap-2">
                            {(isOpen ? fields : fields.slice(0, 3)).map(f => (
                              <span key={f} className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded px-1.5 py-0.5">
                                <span className="text-gray-500">{FIELD_LABELS[f] ?? f}</span>
                                <span className="text-red-500 line-through">{log.changes![f].old ?? 'null'}</span>
                                <span className="text-gray-400">→</span>
                                <span className="text-green-700 font-medium">{log.changes![f].new ?? 'null'}</span>
                              </span>
                            ))}
                            {!isOpen && fields.length > 3 && (
                              <button
                                onClick={() => toggleExpand(log.id)}
                                className="text-xs text-[var(--wgi-navy)] hover:underline"
                              >
                                +{fields.length - 3} more
                              </button>
                            )}
                            {isOpen && (
                              <button
                                onClick={() => toggleExpand(log.id)}
                                className="text-xs text-[var(--wgi-navy)] hover:underline"
                              >
                                Show less
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs truncate max-w-[11rem]">
                      {log.user_email ?? (log.changed_by ? `…${log.changed_by.slice(-6)}` : 'system')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button
              onClick={() => load(page - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-gray-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => load(page + 1)}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
