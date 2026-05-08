'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getAuthHeaders } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Platform {
  id: string
  code: string
  name: string
}

interface IFA {
  id: string
  code: string
  name: string
}

interface CommissionType {
  id: string
  code: string
  name: string
}

interface EstablishmentPeriod {
  split_pct: number      // stored as 0–100 in state, converted to 0–1 on save
  release_months: number
}

interface PaymentMatrixRule {
  id: string
  platform_id: string
  ifa_id: string | null
  commission_type_code: string | null
  ifa_rate: number
  company_rate: number
  has_establishment_periods: boolean
  establishment_config: {
    periods: number
    splits: number[]
    release_months: number[]
    start_from: string
  } | null
  is_active: boolean
  effective_start_date: string
  effective_end_date: string | null
  platform?: { code: string; name: string }
  ifa?: { code: string; name: string } | null
}

interface FormState {
  platform_id: string
  ifa_id: string
  commission_type_code: string
  ifa_rate_pct: number
  company_rate_pct: number
  has_establishment_periods: boolean
  is_active: boolean
  effective_start_date: string
  effective_end_date: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPriorityBadge(rule: PaymentMatrixRule) {
  if (rule.ifa_id && rule.commission_type_code)
    return { label: 'P1 Specific', color: 'bg-purple-100 text-purple-800' }
  if (rule.ifa_id)
    return { label: 'P2 IFA', color: 'bg-blue-100 text-blue-800' }
  if (rule.commission_type_code)
    return { label: 'P3 Type', color: 'bg-yellow-100 text-yellow-800' }
  return { label: 'P4 Catch-all', color: 'bg-gray-100 text-gray-700' }
}

const emptyForm: FormState = {
  platform_id: '',
  ifa_id: '',
  commission_type_code: '',
  ifa_rate_pct: 0,
  company_rate_pct: 0,
  has_establishment_periods: false,
  is_active: true,
  effective_start_date: new Date().toISOString().split('T')[0],
  effective_end_date: '',
}

// Fallback commission types if commission_types table is empty
const FALLBACK_TYPES = [
  { id: 'Initial', code: 'Initial', name: 'Initial Commission' },
  { id: 'Trail', code: 'Trail', name: 'Trail Commission' },
  { id: 'Renewal', code: 'Renewal', name: 'Renewal Commission' },
  { id: 'Other', code: 'Other', name: 'Other' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaymentMatrixPage() {
  const router = useRouter()

  // Data
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<PaymentMatrixRule[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [ifas, setIfas] = useState<IFA[]>([])
  const [commissionTypes, setCommissionTypes] = useState<CommissionType[]>([])

  // Filters
  const [filterPlatform, setFilterPlatform] = useState('all')
  const [filterStatus, setFilterStatus] = useState<'active' | 'inactive' | 'all'>('active')

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState<PaymentMatrixRule | null>(null)
  const [form, setForm] = useState<FormState>({ ...emptyForm })
  const [estPeriods, setEstPeriods] = useState<EstablishmentPeriod[]>([{ split_pct: 100, release_months: 0 }])
  const [startFrom, setStartFrom] = useState<'commencement_date' | 'transaction_date'>('commencement_date')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  // ─── Data loading ────────────────────────────────────────────────────────────

  async function checkAuthAndLoad() {
    await Promise.all([loadRules(), loadPlatforms(), loadIFAs(), loadCommissionTypes()])
    setLoading(false)
  }

  async function loadRules() {
    const authHeaders = await getAuthHeaders()
    const res = await fetch('/api/commission/payment-matrix', { headers: authHeaders })
    if (res.ok) setRules(await res.json())
  }

  async function loadPlatforms() {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/commission/platforms', { headers })
    const { platforms } = await res.json()
    setPlatforms(platforms || [])
  }

  async function loadIFAs() {
    const { data } = await supabase
      .from('ifas')
      .select('id, code, name')
      .eq('status', 'active')
      .order('name')
    setIfas(data || [])
  }

  async function loadCommissionTypes() {
    const { data } = await supabase.from('commission_types').select('id, code, name').order('name')
    setCommissionTypes(data && data.length > 0 ? data : FALLBACK_TYPES)
  }

  // ─── Modal helpers ───────────────────────────────────────────────────────────

  function openAddModal() {
    setEditingRule(null)
    setForm({ ...emptyForm, effective_start_date: new Date().toISOString().split('T')[0] })
    setEstPeriods([{ split_pct: 100, release_months: 0 }])
    setStartFrom('commencement_date')
    setFormError('')
    setShowModal(true)
  }

  function openEditModal(rule: PaymentMatrixRule) {
    setEditingRule(rule)
    setForm({
      platform_id: rule.platform_id,
      ifa_id: rule.ifa_id || '',
      commission_type_code: rule.commission_type_code || '',
      ifa_rate_pct: parseFloat((rule.ifa_rate * 100).toFixed(4)),
      company_rate_pct: parseFloat((rule.company_rate * 100).toFixed(4)),
      has_establishment_periods: rule.has_establishment_periods,
      is_active: rule.is_active,
      effective_start_date: rule.effective_start_date,
      effective_end_date: rule.effective_end_date || '',
    })

    if (rule.has_establishment_periods && rule.establishment_config) {
      setEstPeriods(
        rule.establishment_config.splits.map((s, i) => ({
          split_pct: parseFloat((s * 100).toFixed(4)),
          release_months: rule.establishment_config!.release_months[i],
        }))
      )
      setStartFrom(
        rule.establishment_config.start_from === 'transaction_date'
          ? 'transaction_date'
          : 'commencement_date'
      )
    } else {
      setEstPeriods([{ split_pct: 100, release_months: 0 }])
      setStartFrom('commencement_date')
    }

    setFormError('')
    setShowModal(true)
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setFormError('')

    if (!form.platform_id) return setFormError('Platform is required')
    if (form.ifa_rate_pct <= 0) return setFormError('IFA rate must be greater than 0%')
    if (form.ifa_rate_pct + form.company_rate_pct > 100.01)
      return setFormError(
        `Combined rates (${(form.ifa_rate_pct + form.company_rate_pct).toFixed(2)}%) exceed 100%`
      )
    if (!form.effective_start_date) return setFormError('Effective from date is required')

    let establishment_config = null
    if (form.has_establishment_periods) {
      if (estPeriods.length === 0) return setFormError('Add at least one establishment period')
      const splitsSum = estPeriods.reduce((s, p) => s + p.split_pct, 0)
      if (Math.abs(splitsSum - 100) > 0.01)
        return setFormError(`Splits must sum to 100% (currently ${splitsSum.toFixed(2)}%)`)
      establishment_config = {
        periods: estPeriods.length,
        splits: estPeriods.map(p => parseFloat((p.split_pct / 100).toFixed(6))),
        release_months: estPeriods.map(p => p.release_months),
        start_from: startFrom,
      }
    }

    setSaving(true)

    const payload = {
      platform_id: form.platform_id,
      ifa_id: form.ifa_id || null,
      commission_type_code: form.commission_type_code || null,
      ifa_rate: parseFloat((form.ifa_rate_pct / 100).toFixed(6)),
      company_rate: parseFloat((form.company_rate_pct / 100).toFixed(6)),
      has_establishment_periods: form.has_establishment_periods,
      establishment_config,
      is_active: form.is_active,
      effective_start_date: form.effective_start_date,
      effective_end_date: form.effective_end_date || null,
    }

    const authHeaders = await getAuthHeaders()
    const res = editingRule
      ? await fetch(`/api/commission/payment-matrix/${editingRule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/commission/payment-matrix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(payload),
        })

    setSaving(false)

    if (!res.ok) {
      const { error } = await res.json()
      setFormError(`Save failed: ${error}`)
      return
    }

    setShowModal(false)
    await loadRules()
  }

  // ─── Rule actions ────────────────────────────────────────────────────────────

  async function toggleActive(rule: PaymentMatrixRule) {
    const authHeaders = await getAuthHeaders()
    await fetch(`/api/commission/payment-matrix/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ is_active: !rule.is_active }),
    })
    await loadRules()
  }

  async function deleteRule(rule: PaymentMatrixRule) {
    const badge = getPriorityBadge(rule)
    if (
      !confirm(
        `Delete this ${badge.label} rule for ${rule.platform?.name || 'unknown platform'}?\n\nThis cannot be undone.`
      )
    )
      return
    const authHeaders = await getAuthHeaders()
    await fetch(`/api/commission/payment-matrix/${rule.id}`, { method: 'DELETE', headers: authHeaders })
    await loadRules()
  }

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const filteredRules = rules.filter(r => {
    if (filterPlatform !== 'all' && r.platform_id !== filterPlatform) return false
    if (filterStatus === 'active' && !r.is_active) return false
    if (filterStatus === 'inactive' && r.is_active) return false
    return true
  })

  const splitsSum = estPeriods.reduce((s, p) => s + p.split_pct, 0)
  const rateSum = form.ifa_rate_pct + form.company_rate_pct
  const rateSumColor =
    rateSum > 100.01 ? 'bg-red-50 text-red-700' :
    rateSum >= 99.99 ? 'bg-green-50 text-green-700' :
    'bg-yellow-50 text-yellow-700'

  function updatePeriod(index: number, field: keyof EstablishmentPeriod, value: number) {
    setEstPeriods(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  // ─── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading payment matrix...</p>
        </div>
      </div>
    )
  }

  // Payment Matrix is view-only in this release — rates are applied at upload time.
  // Set READ_ONLY = false to re-enable editing once the matrix is wired into the upload flow.
  const READ_ONLY = true

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100">

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <button
          onClick={() => router.push('/commission/admin')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors"
        >
          ← Back to Admin
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--wgi-text)' }}>Payment Matrix</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--wgi-text-muted)' }}>Commission calculation rules per platform, IFA and type</p>
          </div>
          {!READ_ONLY && (
            <button onClick={openAddModal} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium">
              + Add Rule
            </button>
          )}
        </div>

        {/* ── Read-only notice ── */}
        {READ_ONLY && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-md text-sm flex items-start gap-3">
            <span className="text-amber-500 text-lg leading-tight">⚠</span>
            <div>
              <p className="font-semibold">Payment Matrix — View Only</p>
              <p className="mt-0.5 text-amber-700">
                Commission rates are currently applied at upload time (12.5% default).
                Rule editing is disabled in this release and will be enabled in a future update.
              </p>
            </div>
          </div>
        )}

        {/* ── Priority Legend ── */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Rule Priority — first match wins when calculating commissions</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {[
              { label: 'P1 Specific', color: 'bg-purple-100 text-purple-800', desc: 'Platform + IFA + Type' },
              { label: 'P2 IFA', color: 'bg-blue-100 text-blue-800', desc: 'Platform + IFA (all types)' },
              { label: 'P3 Type', color: 'bg-yellow-100 text-yellow-800', desc: 'Platform + Type (all IFAs)' },
              { label: 'P4 Catch-all', color: 'bg-gray-100 text-gray-700', desc: 'Platform (all IFAs, all types)' },
            ].map((item, i, arr) => (
              <span key={item.label} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.color}`}>{item.label}</span>
                <span className="text-gray-500">{item.desc}</span>
                {i < arr.length - 1 && <span className="text-gray-300 ml-2">→</span>}
              </span>
            ))}
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Platform</label>
            <select
              value={filterPlatform}
              onChange={e => setFilterPlatform(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Platforms</option>
              {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <div className="flex rounded-md border border-gray-300 overflow-hidden text-sm">
              {(['active', 'inactive', 'all'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-2 capitalize ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <span className="text-sm text-gray-500 self-center">{filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}</span>
        </div>

        {/* ── Rules Table ── */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {filteredRules.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              <p className="mt-3 text-gray-600">No rules found.</p>
              <button
                onClick={openAddModal}
                className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
              >
                Add your first rule
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Priority', 'Platform', 'IFA', 'Commission Type', 'IFA Rate', 'Co. Rate', 'Est. Periods', 'Effective', 'Status', ...(READ_ONLY ? [] : ['Actions'])].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRules.map(rule => {
                    const badge = getPriorityBadge(rule)
                    return (
                      <tr key={rule.id} className={`hover:bg-gray-50 ${!rule.is_active ? 'opacity-50' : ''}`}>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>{badge.label}</span>
                        </td>

                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {rule.platform?.name || rule.platform_id}
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                          {rule.ifa
                            ? <span><span className="font-mono text-xs bg-gray-100 px-1 rounded">{rule.ifa.code}</span> <span className="text-gray-500">{rule.ifa.name}</span></span>
                            : <span className="text-gray-400 italic text-xs">All IFAs</span>
                          }
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                          {rule.commission_type_code
                            ? <span className="font-medium">{rule.commission_type_code}</span>
                            : <span className="text-gray-400 italic text-xs">All types</span>
                          }
                        </td>

                        <td className="px-4 py-3 text-sm font-semibold text-green-700 whitespace-nowrap">
                          {(rule.ifa_rate * 100).toFixed(2)}%
                        </td>

                        <td className="px-4 py-3 text-sm font-semibold text-blue-700 whitespace-nowrap">
                          {(rule.company_rate * 100).toFixed(2)}%
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-600">
                          {rule.has_establishment_periods && rule.establishment_config ? (
                            <div className="min-w-0">
                              <span className="text-green-600 font-medium text-xs">{rule.establishment_config.periods} splits</span>
                              <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-1">
                                {rule.establishment_config.splits.map((s, i) => (
                                  <span key={i} className="bg-gray-100 px-1 rounded">
                                    {(s * 100).toFixed(0)}%@{rule.establishment_config!.release_months[i]}mo
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">Immediate</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          <div>{rule.effective_start_date}</div>
                          {rule.effective_end_date
                            ? <div className="text-orange-500">→ {rule.effective_end_date}</div>
                            : <div className="text-green-500">→ No expiry</div>
                          }
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${rule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        {!READ_ONLY && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-3 text-sm">
                              <button onClick={() => openEditModal(rule)} className="text-blue-600 hover:text-blue-800 font-medium">
                                Edit
                              </button>
                              <button
                                onClick={() => toggleActive(rule)}
                                className={`font-medium ${rule.is_active ? 'text-yellow-600 hover:text-yellow-800' : 'text-green-600 hover:text-green-800'}`}
                              >
                                {rule.is_active ? 'Disable' : 'Enable'}
                              </button>
                              <button onClick={() => deleteRule(rule)} className="text-red-500 hover:text-red-700 font-medium">
                                Delete
                              </button>
                            </div>
                          </td>
                        )}

                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════
          Add / Edit Modal (disabled in READ_ONLY mode)
      ══════════════════════════════════════════ */}
      {showModal && !READ_ONLY && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8">

            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">
                {editingRule ? 'Edit Payment Matrix Rule' : 'Add Payment Matrix Rule'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-5">

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{formError}</div>
              )}

              {/* ── Section 1: Scope ── */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Scope</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Platform <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.platform_id}
                      onChange={e => setForm(f => ({ ...f, platform_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">Select platform...</option>
                      {platforms.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      IFA <span className="text-xs text-gray-400 font-normal">(blank = all IFAs)</span>
                    </label>
                    <select
                      value={form.ifa_id}
                      onChange={e => setForm(f => ({ ...f, ifa_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">— All IFAs —</option>
                      {ifas.map(i => (
                        <option key={i.id} value={i.id}>{i.code} – {i.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Commission Type <span className="text-xs text-gray-400 font-normal">(blank = all types)</span>
                  </label>
                  <select
                    value={form.commission_type_code}
                    onChange={e => setForm(f => ({ ...f, commission_type_code: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">— All Commission Types —</option>
                    {commissionTypes.map(ct => (
                      <option key={ct.id} value={ct.code}>{ct.name} ({ct.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── Section 2: Rates ── */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Rates</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      IFA Rate (%) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={form.ifa_rate_pct || ''}
                      onChange={e => setForm(f => ({ ...f, ifa_rate_pct: parseFloat(e.target.value) || 0 }))}
                      placeholder="e.g. 2.50"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Rate (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.company_rate_pct || ''}
                      onChange={e => setForm(f => ({ ...f, company_rate_pct: parseFloat(e.target.value) || 0 }))}
                      placeholder="e.g. 0.50"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>

                {/* Live rate sum feedback */}
                <div className={`mt-2 px-3 py-2 rounded text-sm ${rateSumColor}`}>
                  Combined: <strong>{rateSum.toFixed(2)}%</strong>
                  {rateSum > 100.01 && ' — Exceeds 100%, fix before saving'}
                  {rateSum >= 99.99 && rateSum <= 100.01 && ' — Fully allocated ✓'}
                  {rateSum < 99.99 && rateSum > 0 && ` — ${(100 - rateSum).toFixed(2)}% retained (e.g. platform fee)`}
                  {rateSum === 0 && ' — Enter rates above'}
                </div>
              </div>

              {/* ── Section 3: Effective Dates ── */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Effective Period</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      From <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.effective_start_date}
                      onChange={e => setForm(f => ({ ...f, effective_start_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Until <span className="text-xs text-gray-400 font-normal">(blank = no expiry)</span>
                    </label>
                    <input
                      type="date"
                      value={form.effective_end_date}
                      onChange={e => setForm(f => ({ ...f, effective_end_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* ── Section 4: Establishment Periods ── */}
              <div className="border-t border-gray-200 pt-5">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">Establishment Periods</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Split the IFA commission into multiple payments over time</p>
                  </div>
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, has_establishment_periods: !f.has_establishment_periods }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.has_establishment_periods ? 'bg-blue-600' : 'bg-gray-300'}`}
                    aria-label="Toggle establishment periods"
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.has_establishment_periods ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {form.has_establishment_periods && (
                  <div className="mt-4 space-y-4">
                    {/* start_from */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-2">Release dates calculated from</label>
                      <div className="flex gap-2">
                        {(['commencement_date', 'transaction_date'] as const).map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setStartFrom(opt)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                              startFrom === opt
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {opt === 'commencement_date' ? 'Policy commencement date' : 'Transaction date (CSV)'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Period rows */}
                    <div>
                      {/* Column headers */}
                      <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 mb-1 px-1">
                        <span className="text-xs font-medium text-gray-400">#</span>
                        <span className="text-xs font-medium text-gray-500">Split %</span>
                        <span className="text-xs font-medium text-gray-500">Release after (months)</span>
                        <span />
                      </div>

                      <div className="space-y-2">
                        {estPeriods.map((period, i) => (
                          <div key={i} className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 items-center">
                            <span className="text-sm text-gray-400 text-center font-medium">{i + 1}</span>
                            <div className="relative">
                              <input
                                type="number"
                                min="0.01"
                                max="100"
                                step="0.01"
                                value={period.split_pct || ''}
                                onChange={e => updatePeriod(i, 'split_pct', parseFloat(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm pr-7 focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. 72.00"
                              />
                              <span className="absolute right-2 top-2.5 text-gray-400 text-xs pointer-events-none">%</span>
                            </div>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={period.release_months === 0 && i === 0 ? '0' : period.release_months || ''}
                                onChange={e => updatePeriod(i, 'release_months', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm pr-8 focus:ring-2 focus:ring-blue-500"
                                placeholder="0"
                              />
                              <span className="absolute right-2 top-2.5 text-gray-400 text-xs pointer-events-none">mo</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setEstPeriods(prev => prev.filter((_, j) => j !== i))}
                              disabled={estPeriods.length === 1}
                              className="text-red-400 hover:text-red-600 text-lg leading-none disabled:opacity-30 disabled:cursor-not-allowed text-center"
                              title="Remove period"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Add period + sum validation */}
                      <div className="flex items-center justify-between mt-3">
                        <button
                          type="button"
                          onClick={() => setEstPeriods(prev => [...prev, { split_pct: 0, release_months: 0 }])}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          + Add period
                        </button>
                        <span className={`text-sm font-medium ${Math.abs(splitsSum - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                          Total: {splitsSum.toFixed(2)}%
                          {Math.abs(splitsSum - 100) < 0.01 ? ' ✓' : ' — must equal 100%'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Section 5: Active Toggle ── */}
              <div className="border-t border-gray-200 pt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Rule is active</p>
                  <p className="text-xs text-gray-500">Inactive rules are ignored during commission calculation</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                  aria-label="Toggle active"
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {saving ? 'Saving...' : editingRule ? 'Save Changes' : 'Create Rule'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
