'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthHeaders } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardStats {
  pendingApproval: number
  pendingApprovalSum: number
  ifasReadyToPay: number
  unmappedPolicies: number
  paidThisMonth: number
  paidThisYear: number
  negativeBalanceIFAs: number
  totalIFAs: number
  totalRecords: number
}

interface BarItem { name: string; balance: number }
interface PieItem { name: string; value: number }

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4']

// Smart Y-axis formatter: uses plain $ for sub-$1000, $k for thousands
function formatYAxis(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    pendingApproval: 0, pendingApprovalSum: 0,
    ifasReadyToPay: 0, unmappedPolicies: 0,
    paidThisMonth: 0, paidThisYear: 0,
    negativeBalanceIFAs: 0,
    totalIFAs: 0, totalRecords: 0,
  })
  const [topIFAs, setTopIFAs] = useState<BarItem[]>([])
  const [platformPie, setPlatformPie] = useState<PieItem[]>([])
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())

  const loadDashboard = useCallback(async () => {
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/commission/dashboard', { headers: authHeaders })
      if (!res.ok) throw new Error('Dashboard API error')
      const data = await res.json()

      setStats({
        pendingApproval: data.pendingApproval ?? 0,
        pendingApprovalSum: data.pendingApprovalSum ?? 0,
        ifasReadyToPay: data.ifasReadyToPay ?? 0,
        unmappedPolicies: data.unmappedPolicies ?? 0,
        paidThisMonth: data.paidThisMonth ?? 0,
        paidThisYear: data.paidThisYear ?? 0,
        negativeBalanceIFAs: data.negativeBalanceIFAs ?? 0,
        totalIFAs: data.totalIFAs ?? 0,
        totalRecords: data.totalRecords ?? 0,
      })
      setTopIFAs(data.topIFAs ?? [])
      setPlatformPie(data.platformPie ?? [])
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  // Refresh when tab regains focus (e.g. after approving records in Master File in another tab)
  useEffect(() => {
    const onFocus = () => loadDashboard()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadDashboard])

  const dismiss = (key: string) => setDismissedAlerts(prev => new Set([...prev, key]))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--wgi-bg)' }}>
        <div className="text-center">
          <div className="wgi-spinner mx-auto" />
          <p className="mt-4" style={{ color: 'var(--wgi-text-muted)', fontSize: '14px' }}>Loading dashboard…</p>
        </div>
      </div>
    )
  }

  // ── Quick actions ────────────────────────────────────────────────────────────
  // NOTE: All class strings must be static literals — Tailwind purges dynamic `bg-${color}-600` in production.
  const actions = [
    { label: 'Upload CSV',        sub: 'Import commission data',              href: '/commission/admin/upload',          btnCls: 'bg-blue-600   hover:bg-blue-700',   subCls: 'text-blue-100' },
    { label: 'Review Approvals',  sub: `${stats.pendingApproval} pending`,    href: '/commission/admin/approvals',       btnCls: 'bg-amber-600  hover:bg-amber-700',  subCls: 'text-amber-100' },
    { label: 'Process Payments',  sub: `${stats.ifasReadyToPay} IFAs ready`, href: '/commission/admin/payments',        btnCls: 'bg-green-600  hover:bg-green-700',  subCls: 'text-green-100' },
    { label: 'Manage IFAs',       sub: `${stats.totalIFAs} IFAs`,            href: '/commission/admin/ifas',            btnCls: 'bg-purple-600 hover:bg-purple-700', subCls: 'text-purple-100' },
    { label: 'Master File',       sub: 'View all data',                       href: '/commission/admin/master-file',     btnCls: 'bg-indigo-600 hover:bg-indigo-700', subCls: 'text-indigo-100' },
    { label: 'Payment Matrix',    sub: 'Commission rules',                    href: '/commission/admin/payment-matrix',  btnCls: 'bg-orange-600 hover:bg-orange-700', subCls: 'text-orange-100' },
    { label: 'KPI Dashboard',     sub: 'Revenue & alerts',                    href: '/commission/admin/kpi',             btnCls: 'bg-teal-600   hover:bg-teal-700',   subCls: 'text-teal-100' },
    { label: 'Unmapped Policies', sub: stats.unmappedPolicies > 0 ? `${stats.unmappedPolicies} need mapping` : 'All resolved', href: '/commission/admin/unmapped', btnCls: stats.unmappedPolicies > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-500 hover:bg-gray-600', subCls: stats.unmappedPolicies > 0 ? 'text-red-100' : 'text-gray-200' },
    { label: 'Audit Log',         sub: 'Change history',                      href: '/commission/admin/audit-log',       btnCls: 'bg-slate-600  hover:bg-slate-700',  subCls: 'text-slate-100' },
  ]

  return (
    <div className="min-h-screen" style={{ background: 'var(--wgi-bg)' }}>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Alert banners ─────────────────────────────────────────────────── */}
        {stats.unmappedPolicies > 0 && !dismissedAlerts.has('unmapped') && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '12px 16px', borderRadius: '10px', fontSize: '14px' }}>
            <span><strong>{stats.unmappedPolicies} unmapped policies</strong> could not be matched to an IFA in Azure.</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={() => router.push('/commission/admin/unmapped')} style={{ color: '#B91C1C', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>Manage →</button>
              <button aria-label="Dismiss unmapped policies alert" onClick={() => dismiss('unmapped')} style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
            </div>
          </div>
        )}
        {stats.negativeBalanceIFAs > 0 && !dismissedAlerts.has('negative') && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '12px 16px', borderRadius: '10px', fontSize: '14px' }}>
            <span><strong>{stats.negativeBalanceIFAs} IFAs</strong> have a negative balance.</span>
            <button aria-label="Dismiss negative balances alert" onClick={() => dismiss('negative')} style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
          </div>
        )}
        {stats.pendingApproval > 0 && !dismissedAlerts.has('pending') && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', padding: '12px 16px', borderRadius: '10px', fontSize: '14px' }}>
            <span><strong>{stats.pendingApproval} transactions</strong> are awaiting approval ({formatCurrency(stats.pendingApprovalSum, 'USD')} total IFA value).</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={() => router.push('/commission/admin/approvals')} style={{ color: '#1D4ED8', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>Review →</button>
              <button aria-label="Dismiss pending approvals alert" onClick={() => dismiss('pending')} style={{ color: '#60A5FA', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
            </div>
          </div>
        )}

        {/* ── Metric cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Pending Approval',  value: stats.pendingApproval,                     sub: formatCurrency(stats.pendingApprovalSum, 'USD'), accent: '#D97706', accentBg: '#FFFBEB', href: '/commission/admin/approvals' },
            { label: 'IFAs Ready to Pay', value: stats.ifasReadyToPay,                      sub: 'approved balance > $0', accent: '#059669', accentBg: '#F0FDF4', href: '/commission/admin/payments' },
            { label: 'Unmapped Policies', value: stats.unmappedPolicies,                     sub: 'need IFA match', accent: stats.unmappedPolicies > 0 ? '#DC2626' : '#64748B', accentBg: stats.unmappedPolicies > 0 ? '#FEF2F2' : '#F8FAFC', href: '/commission/admin/unmapped' },
            { label: 'Paid This Month',   value: formatCurrency(stats.paidThisMonth, 'USD'), sub: 'IFA commissions', accent: 'var(--wgi-accent)', accentBg: '#EFF6FF', href: '/commission/admin/payments' },
            { label: 'Total IFAs',        value: stats.totalIFAs,                            sub: 'registered advisors', accent: '#7C3AED', accentBg: '#F5F3FF', href: '/commission/admin/ifas' },
            { label: 'Commission Records',value: stats.totalRecords,                         sub: 'in database', accent: 'var(--wgi-navy-500)', accentBg: '#F0F4FF', href: '#' },
            { label: 'Negative Balances', value: stats.negativeBalanceIFAs,                  sub: 'IFAs', accent: stats.negativeBalanceIFAs > 0 ? '#DC2626' : '#64748B', accentBg: stats.negativeBalanceIFAs > 0 ? '#FEF2F2' : '#F8FAFC', href: '/commission/admin/ifas' },
            { label: 'Paid This Year',    value: formatCurrency(stats.paidThisYear, 'USD'),  sub: `${new Date().getFullYear()} total (USD)`, accent: '#64748B', accentBg: '#F8FAFC', href: '#' },
          ].map(({ label, value, sub, accent, accentBg, href }) => (
            <div
              key={label}
              onClick={() => href !== '#' && router.push(href)}
              className="wgi-card"
              style={{
                padding: '18px 20px',
                cursor: href !== '#' ? 'pointer' : 'default',
                borderLeft: `4px solid ${accent}`,
                transition: 'box-shadow 0.2s, transform 0.2s',
              }}
              onMouseEnter={e => { if (href !== '#') { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
            >
              <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--wgi-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: accent, marginTop: '6px', letterSpacing: '-0.02em' }}>{value}</p>
              <p style={{ fontSize: '12px', color: 'var(--wgi-text-light)', marginTop: '2px' }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Charts ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top IFAs bar chart */}
          <div className="wgi-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--wgi-text)', marginBottom: '16px', letterSpacing: '0.01em' }}>Top IFAs by Current Balance</h3>
            {topIFAs.length === 0 ? (
              <p style={{ fontSize: '14px', color: 'var(--wgi-text-light)', textAlign: 'center', padding: '32px 0' }}>No approved balances yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topIFAs} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={formatYAxis} />
                  <Tooltip formatter={(v: any) => formatCurrency(v ?? 0, 'USD')} />
                  <Bar dataKey="balance" fill="var(--wgi-accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Platform distribution pie */}
          <div className="wgi-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--wgi-text)', marginBottom: '16px', letterSpacing: '0.01em' }}>Transactions by Platform</h3>
            {platformPie.length === 0 ? (
              <p style={{ fontSize: '14px', color: 'var(--wgi-text-light)', textAlign: 'center', padding: '32px 0' }}>No transactions uploaded yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={platformPie} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                    {platformPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Quick actions ─────────────────────────────────────────────────── */}
        <div className="wgi-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--wgi-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {actions.map(({ label, sub, href, btnCls, subCls }) => (
              <button
                key={label}
                onClick={() => router.push(href)}
                className={`${btnCls} text-white rounded-xl px-4 py-4 text-left transition-all hover:scale-[1.02] hover:shadow-md`}
              >
                <p className="font-semibold text-sm">{label}</p>
                <p className={`text-xs ${subCls} mt-0.5`}>{sub}</p>
              </button>
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}
