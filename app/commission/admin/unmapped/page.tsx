'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthHeaders, supabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

interface UnmappedPolicy {
  id: string
  policy_number: string
  policy_holder_name: string | null
  status: string
  created_at: string
  platform: { name: string } | null
}

interface IFA {
  id: string
  code: string
  name: string
}

interface RetryResult {
  total_checked: number
  found_in_azure: number
  newly_mapped: number
  still_unmapped: number
  errors: string[]
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function UnmappedPage() {
  const router = useRouter()

  const [policies,      setPolicies]      = useState<UnmappedPolicy[]>([])
  const [ifas,          setIfas]          = useState<IFA[]>([])
  const [loading,       setLoading]       = useState(true)
  const [retrying,      setRetrying]      = useState(false)
  const [retryResult,   setRetryResult]   = useState<RetryResult | null>(null)
  const [assignments,   setAssignments]   = useState<Record<string, string>>({})
  const [assigning,     setAssigning]     = useState<string | null>(null)
  const [successMsg,    setSuccessMsg]    = useState<string | null>(null)
  const [error,         setError]         = useState<string | null>(null)

  // ── Data loading ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const headers = await getAuthHeaders()
    const [{ data: crRows }, ifasRes] = await Promise.all([
      supabase
        .from('commission_records')
        .select('policy_number, policy_holder_name, created_at, platform:platforms(name)')
        .is('ifa_id', null)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
      fetch('/api/commission/ifas', { headers }).then(r => r.ok ? r.json() : { ifas: [] }),
    ])
    const ifaList: IFA[] = ifasRes?.ifas ?? ifasRes ?? []

    // Deduplicate by policy_number — keep earliest created_at per policy
    const seen = new Map<string, UnmappedPolicy>()
    for (const row of crRows ?? []) {
      if (!seen.has(row.policy_number)) {
        seen.set(row.policy_number, {
          id: row.policy_number,
          policy_number: row.policy_number,
          policy_holder_name: row.policy_holder_name ?? null,
          status: 'pending',
          created_at: row.created_at,
          platform: (row.platform as any) ?? null,
        })
      }
    }

    setPolicies([...seen.values()])
    setIfas((ifaList ?? []) as IFA[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleRetryAzure() {
    setRetrying(true)
    setRetryResult(null)
    setError(null)
    setSuccessMsg(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/commission/remap-unmapped', { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Retry failed')
      setRetryResult(data as RetryResult)
      await load()
    } catch (e: any) {
      setError(`Azure retry failed: ${e.message}`)
    } finally {
      setRetrying(false)
    }
  }

  async function handleAssign(policyNumber: string) {
    const ifaId = assignments[policyNumber]
    if (!ifaId) return
    setAssigning(policyNumber)
    setError(null)
    setSuccessMsg(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/commission/admin/map-policy', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy_number: policyNumber, ifa_id: ifaId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Assignment failed')
      // Remove from local list immediately
      setPolicies(prev => prev.filter(p => p.policy_number !== policyNumber))
      setSuccessMsg(
        `${policyNumber} → ${data.ifa_code} (${data.ifa_name}). ` +
        `${data.commission_records_updated} commission record${data.commission_records_updated !== 1 ? 's' : ''} updated. ` +
        `Future uploads of this policy will resolve automatically.`
      )
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAssigning(null)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading unmapped policies…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--wgi-text)' }}>Unmapped Policies</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--wgi-text-muted)' }}>
              {policies.length === 0
                ? 'All policies have been matched to an IFA'
                : `${policies.length} polic${policies.length === 1 ? 'y' : 'ies'} could not be matched to an IFA`}
            </p>
          </div>
          <button
            onClick={handleRetryAzure}
            disabled={retrying || policies.length === 0}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm disabled:opacity-50"
          >
            {retrying ? 'Retrying Azure…' : 'Retry Azure Lookup'}
          </button>
        </div>

        {/* ── Azure retry result ──────────────────────────────────────────── */}
        {retryResult && (
          <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-md text-sm space-y-1">
            <p className="font-medium">Azure retry complete</p>
            <p>
              Checked <strong>{retryResult.total_checked}</strong> distinct polic{retryResult.total_checked === 1 ? 'y' : 'ies'} —
              found <strong>{retryResult.found_in_azure}</strong> in Azure,
              newly mapped <strong>{retryResult.newly_mapped}</strong>,
              still unmapped <strong>{retryResult.still_unmapped}</strong>.
            </p>
            {retryResult.errors.length > 0 && (
              <ul className="list-disc list-inside text-blue-700 mt-1">
                {retryResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                {retryResult.errors.length > 5 && (
                  <li>…and {retryResult.errors.length - 5} more errors</li>
                )}
              </ul>
            )}
          </div>
        )}

        {/* ── Success message ─────────────────────────────────────────────── */}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md text-sm flex items-start justify-between">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="ml-4 text-green-600 hover:text-green-800 font-bold text-lg leading-none">×</button>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm flex items-start justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-4 text-red-500 hover:text-red-700 font-bold text-lg leading-none">×</button>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {policies.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-green-500 text-5xl mb-3">✓</div>
            <p className="text-lg font-medium text-gray-700">No unmapped policies</p>
            <p className="text-sm text-gray-500 mt-1">All policies have been matched to an IFA.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">

            {/* Info banner */}
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
              <strong>Manual assignment</strong> — select an IFA and click Assign.
              The mapping is saved permanently: future uploads of the same policy number resolve automatically.
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Policy Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Policy Holder</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Since</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-80">Assign IFA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {policies.map(p => (
                    <tr key={p.policy_number} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">{p.policy_number}</td>
                      <td className="px-4 py-3 text-gray-600">{p.policy_holder_name || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{p.platform?.name || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 items-center">
                          <select
                            value={assignments[p.policy_number] || ''}
                            onChange={e =>
                              setAssignments(prev => ({ ...prev, [p.policy_number]: e.target.value }))
                            }
                            className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            <option value="">— Select IFA —</option>
                            {ifas.map(ifa => (
                              <option key={ifa.id} value={ifa.id}>
                                {ifa.code} — {ifa.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAssign(p.policy_number)}
                            disabled={!assignments[p.policy_number] || assigning === p.policy_number}
                            className="bg-green-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {assigning === p.policy_number ? 'Saving…' : 'Assign'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* ── How it works note ───────────────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow px-5 py-4 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600 text-sm mb-2">How unmapped policy resolution works</p>
          <p><strong>1. Azure first</strong> — on every upload, each policy number is looked up in Azure SQL (ContactsExport table). If found, the IFA is resolved automatically.</p>
          <p><strong>2. Manual mapping fallback</strong> — if Azure doesn&apos;t know the policy, you assign it here. The assignment is saved to a persistent table so the next upload of this policy resolves automatically without coming back here.</p>
          <p><strong>3. Retry Azure</strong> — use &quot;Retry Azure Lookup&quot; to re-run the lookup for all currently unmapped policies. Useful when Azure data is updated after the upload.</p>
        </div>

      </main>
    </div>
  )
}
