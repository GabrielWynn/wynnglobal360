'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthHeaders } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { AlertBanner } from '@/components/commission/AlertBanner'
import { StatCard } from '@/components/commission/StatCard'

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

// ── Percentage table (replaces the dashboard bar/pie charts) ────────────────────
function PercentTable({ rows, nameLabel, valueLabel, formatValue }: {
  rows: { name: string; value: number }[]
  nameLabel: string
  valueLabel: string
  formatValue: (v: number) => string
}) {
  const total = rows.reduce((s, r) => s + (r.value || 0), 0)
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-[0.08em] text-[var(--wgi-text-muted)]">
          <th className="pb-2 text-left font-semibold">{nameLabel}</th>
          <th className="pb-2 text-right font-semibold">{valueLabel}</th>
          <th className="pb-2 pl-3 text-right font-semibold">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const pct = total > 0 ? r.value / total : 0
          return (
            <tr key={`${r.name}-${i}`} className="border-t border-[var(--wgi-border)]">
              <td className="max-w-[150px] truncate py-1.5 text-[var(--wgi-text)]" title={r.name}>{r.name}</td>
              <td className="cm-mono py-1.5 text-right font-semibold text-[var(--wgi-navy)]">{formatValue(r.value)}</td>
              <td className="py-1.5 pl-3">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--wgi-bg)]">
                    <div className="h-full rounded-full bg-[var(--wgi-navy)]" style={{ width: `${(pct * 100).toFixed(1)}%` }} />
                  </div>
                  <span className="cm-mono w-11 text-right text-[var(--wgi-text-muted)]">{(pct * 100).toFixed(1)}%</span>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
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
  // Restrained nav cards (DESIGN-COMMISSION.md): white surface + navy label, no
  // rainbow fills. `attention` flags an unresolved state with a subtle accent.
  const actions = [
    { label: 'Upload CSV',        sub: 'Import commission data',              href: '/commission/admin/upload',         attention: false },
    { label: 'Review Approvals',  sub: `${stats.pendingApproval} pending`,    href: '/commission/admin/approvals',      attention: false },
    { label: 'Process Payments',  sub: `${stats.ifasReadyToPay} IFAs ready`,  href: '/commission/admin/payments',       attention: false },
    { label: 'Manage IFAs',       sub: `${stats.totalIFAs} IFAs`,             href: '/commission/admin/ifas',           attention: false },
    { label: 'Master File',       sub: 'View all data',                       href: '/commission/admin/master-file',    attention: false },
    { label: 'Payment Matrix',    sub: 'Commission rules',                    href: '/commission/admin/payment-matrix', attention: false },
    { label: 'KPI Dashboard',     sub: 'Revenue & alerts',                    href: '/commission/admin/kpi',            attention: false },
    { label: 'Unmapped Policies', sub: stats.unmappedPolicies > 0 ? `${stats.unmappedPolicies} need mapping` : 'All resolved', href: '/commission/admin/unmapped', attention: stats.unmappedPolicies > 0 },
    { label: 'Audit Log',         sub: 'Change history',                      href: '/commission/admin/audit-log',      attention: false },
  ]

  // ── Metric cards (all 8 preserved) ─────────────────────────────────────────────
  type Metric = { label: string; value: React.ReactNode; sub: string; variant: 'default' | 'warning' | 'alert'; mono: boolean; href: string }
  const metrics: Metric[] = [
    { label: 'Pending Approval',   value: stats.pendingApproval,                     sub: `${formatCurrency(stats.pendingApprovalSum, 'USD')} IFA value`, variant: stats.pendingApproval > 0 ? 'warning' : 'default', mono: false, href: '/commission/admin/approvals' },
    { label: 'IFAs Ready to Pay',  value: stats.ifasReadyToPay,                      sub: 'approved balance > $0',  variant: 'default', mono: false, href: '/commission/admin/payments' },
    { label: 'Unmapped Policies',  value: stats.unmappedPolicies,                    sub: 'need IFA match',         variant: stats.unmappedPolicies > 0 ? 'alert' : 'default', mono: false, href: '/commission/admin/unmapped' },
    { label: 'Paid This Month',    value: formatCurrency(stats.paidThisMonth, 'USD'), sub: 'IFA commissions',       variant: 'default', mono: true,  href: '/commission/admin/payments' },
    { label: 'Total IFAs',         value: stats.totalIFAs,                           sub: 'registered advisors',    variant: 'default', mono: false, href: '/commission/admin/ifas' },
    { label: 'Commission Records', value: stats.totalRecords,                        sub: 'in database',            variant: 'default', mono: false, href: '#' },
    { label: 'Negative Balances',  value: stats.negativeBalanceIFAs,                 sub: 'IFAs',                   variant: stats.negativeBalanceIFAs > 0 ? 'alert' : 'default', mono: false, href: '/commission/admin/ifas' },
    { label: 'Paid This Year',     value: formatCurrency(stats.paidThisYear, 'USD'), sub: `${new Date().getFullYear()} total (USD)`, variant: 'default', mono: true, href: '#' },
  ]

  return (
    <div className="min-h-[calc(100vh-105px)]" style={{ background: 'var(--wgi-bg)' }}>

      {/* ── Alert banners (edge-to-edge) ──────────────────────────────────── */}
      {stats.unmappedPolicies > 0 && !dismissedAlerts.has('unmapped') && (
        <AlertBanner
          level="critical"
          cta="Manage"
          onCta={() => router.push('/commission/admin/unmapped')}
          onDismiss={() => dismiss('unmapped')}
        >
          <strong>{stats.unmappedPolicies} unmapped policies</strong> could not be matched to an IFA in Azure.
        </AlertBanner>
      )}
      {stats.negativeBalanceIFAs > 0 && !dismissedAlerts.has('negative') && (
        <AlertBanner level="warning" onDismiss={() => dismiss('negative')}>
          <strong>{stats.negativeBalanceIFAs} IFAs</strong> have a negative balance &mdash; review before next payment run.
        </AlertBanner>
      )}
      {stats.pendingApproval > 0 && !dismissedAlerts.has('pending') && (
        <AlertBanner
          level="warning"
          cta="Review"
          onCta={() => router.push('/commission/admin/approvals')}
          onDismiss={() => dismiss('pending')}
        >
          <strong>{stats.pendingApproval} transactions</strong> awaiting approval ({formatCurrency(stats.pendingApprovalSum, 'USD')} total IFA value).
        </AlertBanner>
      )}

      {/* ── Stat strips (edge-to-edge, all 8 preserved) ───────────────────── */}
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--wgi-border)] border-b border-[var(--wgi-border)] bg-[var(--wgi-surface)] lg:grid-cols-4 lg:divide-y-0">
        {metrics.slice(0, 4).map((m) => (
          <div
            key={m.label}
            onClick={() => m.href !== '#' && router.push(m.href)}
            className={m.href !== '#' ? 'cursor-pointer transition-colors hover:bg-[var(--wgi-bg)]' : ''}
          >
            <StatCard label={m.label} value={m.value} sub={m.sub} variant={m.variant} mono={m.mono} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--wgi-border)] border-b border-[var(--wgi-border)] bg-[var(--wgi-surface)] lg:grid-cols-4 lg:divide-y-0">
        {metrics.slice(4).map((m) => (
          <div
            key={m.label}
            onClick={() => m.href !== '#' && router.push(m.href)}
            className={m.href !== '#' ? 'cursor-pointer transition-colors hover:bg-[var(--wgi-bg)]' : ''}
          >
            <StatCard label={m.label} value={m.value} sub={m.sub} variant={m.variant} mono={m.mono} />
          </div>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <main className="space-y-5 px-6 py-5">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-bold text-[var(--wgi-navy)]">Commission Administration</h1>
            <p className="mt-0.5 text-[11px] font-medium text-[var(--wgi-text-muted)]">Operations overview</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.push('/commission/admin/upload')} className="rounded-[4px] border border-[var(--wgi-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--wgi-navy)] hover:border-[var(--wgi-navy)]">+ Upload File</button>
            <button onClick={() => router.push('/commission/admin/approvals')} className="rounded-[4px] bg-[var(--wgi-navy)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--wgi-navy-600)]">Review Approvals</button>
          </div>
        </div>

        {/* ── Charts ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top IFAs bar chart */}
          <div className="overflow-hidden rounded-[6px] border border-[var(--wgi-border)] bg-[var(--wgi-surface)]">
            <div className="border-b border-[var(--wgi-border)] bg-[var(--wgi-bg)] px-4 py-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--wgi-text-muted)]">Top IFAs by Current Balance</h3>
            </div>
            <div className="p-4">
              {topIFAs.length === 0 ? (
                <p style={{ fontSize: '14px', color: 'var(--wgi-text-light)', textAlign: 'center', padding: '32px 0' }}>No approved balances yet</p>
              ) : (
                <PercentTable
                  rows={topIFAs.map(r => ({ name: r.name, value: r.balance }))}
                  nameLabel="IFA"
                  valueLabel="Balance"
                  formatValue={(v) => formatCurrency(v, 'USD')}
                />
              )}
            </div>
          </div>

          {/* Platform distribution pie */}
          <div className="overflow-hidden rounded-[6px] border border-[var(--wgi-border)] bg-[var(--wgi-surface)]">
            <div className="border-b border-[var(--wgi-border)] bg-[var(--wgi-bg)] px-4 py-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--wgi-text-muted)]">Transactions by Platform</h3>
            </div>
            <div className="p-4">
              {platformPie.length === 0 ? (
                <p style={{ fontSize: '14px', color: 'var(--wgi-text-light)', textAlign: 'center', padding: '32px 0' }}>No transactions uploaded yet</p>
              ) : (
                <PercentTable
                  rows={platformPie}
                  nameLabel="Platform"
                  valueLabel="Transactions"
                  formatValue={(v) => v.toLocaleString()}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Quick actions ─────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-[6px] border border-[var(--wgi-border)] bg-[var(--wgi-surface)]">
          <div className="border-b border-[var(--wgi-border)] bg-[var(--wgi-bg)] px-4 py-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--wgi-text-muted)]">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
            {actions.map(({ label, sub, href, attention }) => (
              <button
                key={label}
                onClick={() => router.push(href)}
                className={`rounded-[6px] border bg-[var(--wgi-surface)] px-4 py-4 text-left transition-colors hover:bg-[var(--wgi-bg)] ${attention ? 'border-l-[3px] border-l-[var(--cm-alert-critical-border)] border-[var(--wgi-border)]' : 'border-[var(--wgi-border)]'}`}
              >
                <p className="text-sm font-bold text-[var(--wgi-navy)]">{label}</p>
                <p className={`mt-0.5 text-xs ${attention ? 'font-semibold text-[var(--cm-alert-critical-text)]' : 'text-[var(--wgi-text-muted)]'}`}>{sub}</p>
              </button>
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}
