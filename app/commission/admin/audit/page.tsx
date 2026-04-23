'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface AuditEntry {
  id: string
  table_name: string
  record_id: string
  action: string
  old_value: any
  new_value: any
  override_reason: string | null
  performed_by: string | null
  performed_at: string
}

export default function AuditPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterAction, setFilterAction] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    let query = supabase
      .from('audit_log')
      .select('*')
      .order('performed_at', { ascending: false })
      .limit(500)

    if (filterAction) query = query.eq('action', filterAction)
    if (filterFrom) query = query.gte('performed_at', filterFrom)
    if (filterTo) query = query.lte('performed_at', filterTo + 'T23:59:59')

    const { data, error: err } = await query

    if (err) {
      // audit_log may not exist yet in this environment
      if (err.code === '42P01') {
        setError('Audit log table does not exist yet. Apply the migration first.')
      } else {
        setError(err.message)
      }
      setEntries([])
    } else {
      setEntries(data ?? [])
    }
    setLoading(false)
  }, [filterAction, filterFrom, filterTo])

  useEffect(() => { load() }, [load])

  const actionBadge = (action: string) => {
    const map: Record<string, string> = {
      approve: 'bg-green-100 text-green-800',
      pay:     'bg-blue-100 text-blue-800',
      reject:  'bg-red-100 text-red-800',
      override:'bg-amber-100 text-amber-800',
      create:  'bg-purple-100 text-purple-800',
      update:  'bg-gray-100 text-gray-700',
      delete:  'bg-red-100 text-red-700',
    }
    return map[action] ?? 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow px-4 py-3 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Action</label>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm">
              <option value="">All</option>
              {['approve', 'reject', 'override', 'pay', 'create', 'update', 'delete'].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
          </div>
          <button onClick={load} disabled={loading}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40">
            {loading ? '…' : 'Apply'}
          </button>
          <span className="text-sm text-gray-500 self-center">{entries.length} entries</span>
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading…</div>
          ) : entries.length === 0 && !error ? (
            <div className="p-12 text-center text-gray-400">No audit entries found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['When', 'Action', 'Table', 'Record', 'Details'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {entries.map(e => (
                    <>
                      <tr key={e.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {e.performed_at ? new Date(e.performed_at).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${actionBadge(e.action)}`}>
                            {e.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-mono">{e.table_name}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono">{e.record_id?.slice(0, 8)}…</td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {e.override_reason ? <span className="text-amber-700">{e.override_reason}</span> : 'Click to expand'}
                        </td>
                      </tr>
                      {expanded === e.id && (
                        <tr key={`${e.id}-detail`} className="bg-gray-50">
                          <td colSpan={5} className="px-6 py-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div>
                                <p className="font-semibold text-gray-600 mb-1">Old Value</p>
                                <pre className="bg-white border rounded p-2 text-gray-700 overflow-auto max-h-32">
                                  {JSON.stringify(e.old_value, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="font-semibold text-gray-600 mb-1">New Value</p>
                                <pre className="bg-white border rounded p-2 text-gray-700 overflow-auto max-h-32">
                                  {JSON.stringify(e.new_value, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
