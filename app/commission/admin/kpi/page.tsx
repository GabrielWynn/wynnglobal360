'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthHeaders } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  ResponsiveContainer, LabelList,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

type PresetKey = 'this_month' | 'last_month' | 'this_quarter' | 'ytd' | 'last_12m'

interface GrowthMetric { current: number; prior: number; pct: number | null }
interface TopIFA       { ifa_code: string; name: string; gross: number; wgi: number; pct_of_total: number }

interface UploadRecord {
  id: string
  filename: string
  total_rows: number
  status: string
  uploaded_by_email: string | null
  created_at: string
  platform: { name: string } | null
}

interface KPIData {
  period: { current: { start: string; end: string; label: string }; prior: { label: string } }
  revenue: {
    totals: Record<string, { gross: number; wgi_net: number; ifa_total: number; suspense: number; count: number }>
    growth: { gross_usd: GrowthMetric; wgi_net_usd: GrowthMetric; ifa_usd: GrowthMetric }
    by_commission_type: { commission_type: string; currency: string; gross: number; wgi_net: number; ifa_total: number; count: number }[]
    by_platform: { name: string; currency: string; gross: number; wgi_net: number; count: number; pct_of_total: number | null }[]
    by_month: Record<string, { gross: number; wgi_net: number; ifa_total: number; count: number }>
    paid_ifa_total: number
    policy_count: number
  }
  ifas: { active_count: number; top_5: TopIFA[] }
  ape: {
    total_current: number
    growth: GrowthMetric
    by_ifa: Record<string, { name: string; total: number; policy_count: number }>
  }
  ape_wgi: {
    total_current: number
    growth: GrowthMetric
    by_ifa: Record<string, { name: string; total: number; policy_count: number }>
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Commission chart palette (DESIGN-COMMISSION.md --cm-chart-*) — replaces the
// previous rainbow. CSS variables resolve in both recharts fills and inline styles.
const BRAND_COLORS = [
  'var(--cm-chart-1)', 'var(--cm-chart-2)', 'var(--cm-chart-3)',
  'var(--cm-chart-4)', 'var(--cm-chart-5)', 'var(--cm-chart-6)',
]

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'this_month',   label: 'This Month'   },
  { key: 'last_month',   label: 'Last Month'   },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'ytd',          label: 'YTD'          },
  { key: 'last_12m',     label: 'Last 12M'     },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, cur = 'USD') { return formatCurrency(n, cur) }
function pctBadge(pct: number | null) {
  if (pct === null) return null
  const up = pct >= 0
  return (
    <span className={`text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, growth, accent = 'var(--cm-chart-1)',
}: {
  label: string; value: string; sub?: string; growth?: GrowthMetric; accent?: string
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col">
      <div className="h-1" style={{ backgroundColor: accent }} />
      <div className="p-4 flex-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-black cm-mono text-[var(--wgi-navy)] mt-1 leading-none">{value}</p>
        <div className="flex items-center gap-2 mt-2">
          {growth && pctBadge(growth.pct)}
          {growth && (
            <span className="text-xs text-gray-400">vs {growth.prior > 0 ? fmt(growth.prior) : 'prior'}</span>
          )}
          {sub && !growth && <span className="text-xs text-gray-400">{sub}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function KPIDashboard() {
  const router = useRouter()
  const [loading, setLoading]           = useState(true)
  const [data, setData]                 = useState<KPIData | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [preset, setPreset]             = useState<PresetKey>('ytd')
  const [dateMode, setDateMode]         = useState<'preset' | 'custom'>('preset')
  const [customFrom, setCustomFrom]     = useState('')
  const [customTo, setCustomTo]         = useState('')
  const [uploads, setUploads]           = useState<UploadRecord[]>([])

  const load = useCallback(async (opts: { preset?: PresetKey; from?: string; to?: string }) => {
    setLoading(true); setError(null)
    try {
      const headers = await getAuthHeaders()
      const params  = opts.from && opts.to
        ? `from=${opts.from}&to=${opts.to}`
        : `period=${opts.preset ?? 'ytd'}`
      const [kpiRes, uplRes] = await Promise.all([
        fetch(`/api/commission/kpi?${params}`, { headers }),
        fetch('/api/commission/uploads', { headers }),
      ])
      if (!kpiRes.ok) throw new Error(`KPI API ${kpiRes.status}`)
      setData(await kpiRes.json())
      if (uplRes.ok) {
        const { uploads: rows } = await uplRes.json()
        setUploads(rows ?? [])
      }
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load({ preset })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const applyCustom = () => {
    if (!customFrom || !customTo) return
    load({ from: customFrom, to: customTo })
  }

  // ── Loading / Error ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700 mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Loading dashboard…</p>
      </div>
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <p className="text-red-600 font-semibold">Failed to load data</p>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <button onClick={() => load({ preset })} className="mt-4 bg-[var(--wgi-navy)] text-white px-4 py-2 rounded text-sm">Retry</button>
      </div>
    </div>
  )

  const { revenue, ifas, ape, ape_wgi } = data

  // ── Chart: Commission Type (horizontal) ────────────────────────────────────
  const commTypeData = revenue.by_commission_type
    .filter(r => r.currency === 'USD')
    .sort((a, b) => b.gross - a.gross)
    .map(r => ({ name: r.commission_type || 'Unknown', gross: r.gross, ifa: r.ifa_total }))

  // ── Chart: Revenue by Platform ─────────────────────────────────────────────
  const platformData = revenue.by_platform
    .filter(p => p.currency === 'USD')
    .slice(0, 8)
    .map(p => ({
      name:  p.name.length > 18 ? p.name.slice(0, 16) + '…' : p.name,
      gross: p.gross,
      net:   p.wgi_net,
      pct:   p.pct_of_total ?? 0,
    }))

  // ── Table: APE by IFA ──────────────────────────────────────────────────────
  const apeIFARows = Object.entries(ape.by_ifa)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([code, v]) => ({
      code,
      name:     v.name,
      ape:      v.total,
      policies: v.policy_count,
      avg:      v.policy_count > 0 ? v.total / v.policy_count : 0,
    }))
  const apeTotal    = apeIFARows.reduce((s, r) => s + r.ape, 0)
  const apePolicies = apeIFARows.reduce((s, r) => s + r.policies, 0)
  const apeAvg      = apePolicies > 0 ? apeTotal / apePolicies : 0

  // ── Table: Revenue by Platform full list ───────────────────────────────────
  const platformAllData = revenue.by_platform.filter(p => p.currency === 'USD')

  // ── Period label ───────────────────────────────────────────────────────────
  const periodLabel = data.period.current.label
  const dateRange   = `${data.period.current.start} — ${data.period.current.end}`

  return (
    <div className="min-h-screen bg-slate-50">

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        <button
          onClick={() => router.push('/commission/admin')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[var(--wgi-navy)] font-medium transition-colors"
        >
          ← Back to Admin
        </button>

        {/* ── Date controls toolbar ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl border px-4 py-3" style={{ borderColor: 'var(--wgi-border)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--wgi-text)' }}>WGI Revenue Dashboard</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--wgi-text-muted)' }}>{periodLabel} · {dateRange}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dateMode === 'preset' && PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => { setPreset(p.key); load({ preset: p.key }) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  preset === p.key && dateMode === 'preset'
                    ? 'text-white border-transparent'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                style={preset === p.key && dateMode === 'preset' ? { background: 'var(--wgi-navy)' } : {}}
              >
                {p.label}
              </button>
            ))}
            {dateMode === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-xs" style={{ borderColor: 'var(--wgi-border)' }} />
                <span className="text-xs text-gray-400">→</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-xs" style={{ borderColor: 'var(--wgi-border)' }} />
                <button onClick={applyCustom}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--wgi-navy)' }}>
                  Apply
                </button>
              </div>
            )}
            <button
              onClick={() => setDateMode(m => m === 'preset' ? 'custom' : 'preset')}
              className="border rounded-lg px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors"
              style={{ borderColor: 'var(--wgi-border)', color: 'var(--wgi-text-muted)' }}
            >
              {dateMode === 'preset' ? 'Custom Range' : '← Presets'}
            </button>
          </div>
        </div>

        {/* ══ ROW 1: KPI Cards ══════════════════════════════════════════════ */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label="APE IFA"
            value={fmt(ape.total_current)}
            growth={ape.growth}
            accent="var(--cm-chart-1)"
          />
          <KPICard
            label="APE WGI"
            value={fmt(ape_wgi.total_current)}
            growth={ape_wgi.growth}
            accent="var(--cm-chart-3)"
          />
          <KPICard
            label="Gross Revenue"
            value={fmt(revenue.growth.gross_usd.current)}
            growth={revenue.growth.gross_usd}
            accent="var(--cm-chart-4)"
          />
          <KPICard
            label="WGI Net Revenue"
            value={fmt(revenue.growth.wgi_net_usd.current)}
            growth={revenue.growth.wgi_net_usd}
            accent="var(--cm-chart-6)"
          />
          <KPICard
            label="Paid to IFAs"
            value={fmt(revenue.paid_ifa_total)}
            sub={`${ifas.active_count} active IFAs`}
            accent="var(--cm-chart-2)"
          />
        </section>

        {/* ══ ROW 2: Commission Type + Revenue by Life Company ══════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Commission Type breakdown */}
          <section className="bg-white rounded-lg shadow-sm p-5">
            <p className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-1">Revenue by Commission Type</p>
            <p className="text-xs text-gray-400 mb-4">Gross revenue (USD) · {periodLabel}</p>

            {commTypeData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No data for this period</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(120, commTypeData.length * 44)}>
                  <BarChart
                    data={commTypeData}
                    layout="vertical"
                    margin={{ top: 4, right: 60, left: 0, bottom: 0 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 9, fill: '#9CA3AF' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} width={90} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: any, n?: any) => [fmt(v), n ?? '']} />
                    <Bar dataKey="gross" name="Gross" radius={[0, 3, 3, 0]}>
                      {commTypeData.map((_, i) => <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />)}
                      <LabelList dataKey="gross" position="right" style={{ fontSize: 10, fill: '#374151' }}
                        formatter={(v: any) => `$${(Number(v) / 1000).toFixed(0)}K`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Summary table */}
                <div className="mt-4 border-t pt-3">
                  <div className="grid grid-cols-4 text-xs text-gray-400 font-semibold uppercase tracking-wide pb-1 border-b">
                    <span className="col-span-2">Type</span>
                    <span className="text-right">Gross</span>
                    <span className="text-right">Records</span>
                  </div>
                  {revenue.by_commission_type
                    .filter(r => r.currency === 'USD')
                    .sort((a, b) => b.gross - a.gross)
                    .map((r, i) => (
                      <div key={i} className="grid grid-cols-4 text-xs py-1.5 border-b last:border-0 hover:bg-gray-50">
                        <span className="col-span-2 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                          {r.commission_type || 'Unknown'}
                        </span>
                        <span className="text-right font-semibold text-gray-800">{fmt(r.gross)}</span>
                        <span className="text-right text-gray-500">{r.count}</span>
                      </div>
                    ))}
                </div>
              </>
            )}
          </section>

          {/* Revenue by Life Company (Platform) */}
          <section className="bg-white rounded-lg shadow-sm p-5">
            <p className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-1">Revenue by Life Company</p>
            <p className="text-xs text-gray-400 mb-4">Gross vs WGI Net (USD) · {periodLabel}</p>

            {platformData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No platform data for this period</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(120, platformData.length * 44)}>
                  <BarChart
                    data={platformData}
                    layout="vertical"
                    margin={{ top: 4, right: 60, left: 0, bottom: 0 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 9, fill: '#9CA3AF' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} width={90} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: any, n?: any) => [fmt(v), n ?? '']} />
                    <Bar dataKey="gross" name="Gross" fill={BRAND_COLORS[0]} radius={[0, 3, 3, 0]}>
                      <LabelList dataKey="gross" position="right" style={{ fontSize: 10, fill: '#374151' }}
                        formatter={(v: any) => `$${(Number(v) / 1000).toFixed(0)}K`} />
                    </Bar>
                    <Bar dataKey="net" name="WGI Net" fill={BRAND_COLORS[2]} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Platform table */}
                <div className="mt-4 border-t pt-3">
                  <div className="grid grid-cols-5 text-xs text-gray-400 font-semibold uppercase tracking-wide pb-1 border-b">
                    <span className="col-span-2">Platform</span>
                    <span className="text-right">Gross</span>
                    <span className="text-right">WGI Net</span>
                    <span className="text-right">Share</span>
                  </div>
                  {platformAllData.map((p, i) => (
                    <div key={i} className="grid grid-cols-5 text-xs py-1.5 border-b last:border-0 hover:bg-gray-50">
                      <span className="col-span-2 font-medium text-gray-800">{p.name}</span>
                      <span className="text-right text-gray-700">{fmt(p.gross)}</span>
                      <span className="text-right text-gray-700">{fmt(p.wgi_net)}</span>
                      <span className="text-right font-semibold text-gray-900">
                        {p.pct_of_total !== null ? `${p.pct_of_total.toFixed(0)}%` : '—'}
                      </span>
                    </div>
                  ))}
                  {platformAllData.length > 0 && (
                    <div className="grid grid-cols-5 text-xs pt-2 font-bold text-gray-900">
                      <span className="col-span-2">Total</span>
                      <span className="text-right">{fmt(platformAllData.reduce((s, p) => s + p.gross, 0))}</span>
                      <span className="text-right">{fmt(platformAllData.reduce((s, p) => s + p.wgi_net, 0))}</span>
                      <span className="text-right">100%</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        {/* ══ ROW 4: APE by IFA ═════════════════════════════════════════════ */}
        <section className="bg-white rounded-lg shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-gray-800 uppercase tracking-wide">APE by Adviser (IFA)</p>
              <p className="text-xs text-gray-400">{periodLabel} · Annual Premium Equivalent</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-gray-900">{fmt(apeTotal)}</p>
              <p className="text-xs text-gray-400">{apePolicies} policies</p>
            </div>
          </div>

          {apeIFARows.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No APE data for this period</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Adviser</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">APE (USD)</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Policies</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Avg APE</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide py-2 pr-2">Share</th>
                  <th className="w-32 text-xs font-semibold text-gray-500 uppercase tracking-wide py-2 pl-3">Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {apeIFARows.map((row, i) => {
                  const share = apeTotal > 0 ? (row.ape / apeTotal) * 100 : 0
                  return (
                    <tr key={row.code} className={`border-b last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      <td className="py-2.5 font-medium text-gray-800">{row.name}</td>
                      <td className="py-2.5 text-right font-semibold text-gray-900">{fmt(row.ape)}</td>
                      <td className="py-2.5 text-right text-gray-600">{row.policies}</td>
                      <td className="py-2.5 text-right text-gray-600">{fmt(row.avg)}</td>
                      <td className="py-2.5 text-right font-semibold pr-2" style={{ color: BRAND_COLORS[i % BRAND_COLORS.length] }}>
                        {share.toFixed(0)}%
                      </td>
                      <td className="py-2.5 pl-3">
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full" style={{ width: `${Math.min(share, 100)}%`, backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td className="py-2.5 font-bold text-gray-900">Total</td>
                  <td className="py-2.5 text-right font-bold text-gray-900">{fmt(apeTotal)}</td>
                  <td className="py-2.5 text-right font-bold text-gray-900">{apePolicies}</td>
                  <td className="py-2.5 text-right font-bold text-gray-900">{fmt(apeAvg)}</td>
                  <td className="py-2.5 text-right font-bold text-gray-900 pr-2">100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        {/* ══ ROW 4: Upload History ══════════════════════════════════════════ */}
        <section className="bg-white rounded-lg shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-gray-800 uppercase tracking-wide">Statement Upload History</p>
              <p className="text-xs text-gray-400">All files uploaded to the master file</p>
            </div>
            <span className="text-xs text-gray-400">{uploads.length} upload{uploads.length !== 1 ? 's' : ''}</span>
          </div>

          {uploads.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No uploads recorded yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Date &amp; Time</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">File Name</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Platform</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Rows</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide py-2 pl-4">Uploaded By</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u, i) => {
                  const dt = new Date(u.created_at)
                  const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                  const statusColor =
                    u.status === 'completed' ? 'text-emerald-600 bg-emerald-50' :
                    u.status === 'processing' ? 'text-amber-600 bg-amber-50' :
                    'text-red-600 bg-red-50'
                  return (
                    <tr key={u.id} className={`border-b last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      <td className="py-2.5 text-gray-600 whitespace-nowrap">
                        {dateStr} <span className="text-gray-400">{timeStr}</span>
                      </td>
                      <td className="py-2.5 font-medium text-gray-800 max-w-xs truncate">{u.filename}</td>
                      <td className="py-2.5 text-gray-600">{u.platform?.name ?? '—'}</td>
                      <td className="py-2.5 text-right text-gray-600">{u.total_rows.toLocaleString()}</td>
                      <td className="py-2.5 pl-4 text-gray-600">{u.uploaded_by_email ?? '—'}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusColor}`}>
                          {u.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

      </main>
    </div>
  )
}
