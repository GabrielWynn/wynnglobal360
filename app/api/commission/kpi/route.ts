// app/api/commission/kpi/route.ts
// Comprehensive KPI endpoint for the executive dashboard.
//
// Query params:
//   period = this_month | last_month | this_quarter | ytd | last_12m (default)
//
// Returns two data groups:
//   1. period_scoped  — all metrics driven by the selected period + prior period comparison
//   2. point_in_time  — alerts, funnel, reconciliation (not date-filtered)

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function round2(n: number) { return Math.round(n * 100) / 100 }
function growthPct(current: number, prior: number): number | null {
  if (prior === 0) return current > 0 ? 100 : null
  return round2(((current - prior) / prior) * 100)
}

// ── Period date helpers ───────────────────────────────────────────────────────

type Period = 'this_month' | 'last_month' | 'this_quarter' | 'ytd' | 'last_12m'

interface DateRange { start: string; end: string; label: string }

function getPeriodRange(period: Period): { current: DateRange; prior: DateRange } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-indexed
  const d = now.getDate()

  const iso = (date: Date) => date.toISOString().split('T')[0]
  const ymd = (yr: number, mo: number, dy: number) =>
    `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`

  // Last day of a given month
  const lastDay = (yr: number, mo: number) => new Date(yr, mo, 0).getDate()

  switch (period) {
    case 'this_month': {
      const start = ymd(y, m + 1, 1)
      const end   = iso(now)
      // Prior: same date range in previous month
      const pm = m === 0 ? 12 : m
      const py = m === 0 ? y - 1 : y
      const priorEnd = Math.min(d, lastDay(py, pm))
      return {
        current: { start, end, label: `${now.toLocaleString('en', { month: 'long' })} ${y}` },
        prior:   { start: ymd(py, pm, 1), end: ymd(py, pm, priorEnd), label: 'Prior month' },
      }
    }
    case 'last_month': {
      const pm = m === 0 ? 12 : m
      const py = m === 0 ? y - 1 : y
      const ppm = pm === 1 ? 12 : pm - 1
      const ppy = pm === 1 ? py - 1 : py
      return {
        current: { start: ymd(py, pm, 1), end: ymd(py, pm, lastDay(py, pm)), label: `${new Date(py, pm - 1).toLocaleString('en', { month: 'long' })} ${py}` },
        prior:   { start: ymd(ppy, ppm, 1), end: ymd(ppy, ppm, lastDay(ppy, ppm)), label: 'Month before' },
      }
    }
    case 'this_quarter': {
      const qStart = Math.floor(m / 3) * 3 // 0, 3, 6, 9
      const qNum   = Math.floor(m / 3) + 1
      const pqStart = qStart === 0 ? 9 : qStart - 3
      const pqY     = qStart === 0 ? y - 1 : y
      const pqEnd   = pqStart + 2
      return {
        current: { start: ymd(y, qStart + 1, 1), end: iso(now), label: `Q${qNum} ${y}` },
        prior:   { start: ymd(pqY, pqStart + 1, 1), end: ymd(pqY, pqEnd + 1, lastDay(pqY, pqEnd + 1)), label: `Q${qNum === 1 ? 4 : qNum - 1} ${pqY}` },
      }
    }
    case 'ytd': {
      return {
        current: { start: ymd(y, 1, 1), end: iso(now), label: `YTD ${y}` },
        prior:   { start: ymd(y - 1, 1, 1), end: ymd(y - 1, m + 1, d), label: `YTD ${y - 1}` },
      }
    }
    case 'last_12m':
    default: {
      const start12 = new Date(now); start12.setFullYear(start12.getFullYear() - 1)
      const start24 = new Date(start12); start24.setFullYear(start24.getFullYear() - 1)
      return {
        current: { start: iso(start12), end: iso(now),   label: 'Last 12 months' },
        prior:   { start: iso(start24), end: iso(start12), label: 'Prior 12 months' },
      }
    }
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  const url       = new URL(request.url)
  const period    = (url.searchParams.get('period') ?? 'last_12m') as Period
  const fromParam = url.searchParams.get('from')
  const toParam   = url.searchParams.get('to')

  let current: DateRange, prior: DateRange
  if (fromParam && toParam) {
    const durationMs = new Date(toParam).getTime() - new Date(fromParam).getTime()
    const priorTo    = new Date(new Date(fromParam).getTime() - 86400000)
    const priorFrom  = new Date(priorTo.getTime() - durationMs)
    current = { start: fromParam, end: toParam, label: `${fromParam} → ${toParam}` }
    prior   = {
      start: priorFrom.toISOString().split('T')[0],
      end:   priorTo.toISOString().split('T')[0],
      label: 'Prior period',
    }
  } else {
    const ranges = getPeriodRange(period)
    current = ranges.current
    prior   = ranges.prior
  }

  const thirtyDaysAgo  = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString() })()
  const monthStart     = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })()
  const twelveMonthsAgo     = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setDate(1); return d.toISOString().split('T')[0] })()
  const twentyFourMonthsAgo = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 2); d.setDate(1); return d.toISOString().split('T')[0] })()

  // ── All queries in parallel ───────────────────────────────────────────────
  const [
    currentPeriodRes,
    priorPeriodRes,
    trendRes,
    pipelineRes,
    statusFunnelRes,
    approvedRes,
    advanceRes,
    overdueRes,
    overpayRes,
    allocationRes,
    zeroAmountRes,
    duplicateRes,
    platformRes,
    unmappedRes,
    paidMonthRes,
    priorYearTrendRes,
    velocityRes,
    apeCurrentRes,
    apePriorRes,
    apeTrendRes,
    apeWgiCurrentRes,
    apeWgiPriorRes,
    apeWgiTrendRes,
  ] = await Promise.all([

    // 1. Current period: revenue + IFA breakdown
    supabaseAdmin
      .from('commission_records')
      .select('commission_type, commission_type_code, currency, amount, wg_amount, ifa_amount, suspense_amount, ifa_code, ifa_name, transaction_date, status, policy_number')
      .eq('is_deleted', false)
      .neq('status', 'cancelled')
      .gte('transaction_date', current.start)
      .lte('transaction_date', current.end),

    // 2. Prior period: same shape for growth calculation
    supabaseAdmin
      .from('commission_records')
      .select('commission_type, commission_type_code, currency, amount, wg_amount, ifa_amount')
      .eq('is_deleted', false)
      .neq('status', 'cancelled')
      .gte('transaction_date', prior.start)
      .lte('transaction_date', prior.end),

    // 3. 12-month trend (always rolling 12m regardless of period selector)
    supabaseAdmin
      .from('commission_records')
      .select('transaction_date, currency, amount, wg_amount, ifa_amount')
      .eq('is_deleted', false)
      .neq('status', 'cancelled')
      .gte('transaction_date', twelveMonthsAgo),

    // 4. Pipeline: pending + approved (point in time)
    supabaseAdmin
      .from('commission_records')
      .select('ifa_amount, currency, status')
      .eq('is_deleted', false)
      .in('status', ['pending', 'approved']),

    // 5. Status funnel (all time, point in time)
    supabaseAdmin
      .from('commission_records')
      .select('status, ifa_amount, created_at')
      .eq('is_deleted', false),

    // 6. Unpaid IFA liability
    supabaseAdmin
      .from('commission_records')
      .select('unpaid, currency')
      .eq('status', 'approved')
      .eq('is_deleted', false),

    // 7. Advance reconciliation
    supabaseAdmin
      .from('commission_records')
      .select('is_advance, reconciled_at, created_at')
      .eq('is_deleted', false)
      .neq('status', 'cancelled'),

    // 8. Overdue approved > 30 days
    supabaseAdmin
      .from('commission_records')
      .select('id, ifa_code, ifa_name, ifa_amount, currency, updated_at')
      .eq('status', 'approved')
      .eq('is_deleted', false)
      .lt('updated_at', thirtyDaysAgo),

    // 9. Overpayments
    supabaseAdmin
      .from('commission_records')
      .select('id, ifa_code, ifa_name, unpaid, currency')
      .eq('is_deleted', false)
      .lt('unpaid', 0),

    // 10. Allocation anomalies
    supabaseAdmin
      .from('commission_records')
      .select('id, ifa_code, policy_number, ifa_percentage, wgi_percentage, amount, currency')
      .eq('is_deleted', false)
      .neq('status', 'cancelled'),

    // 11. Zero-amount records
    supabaseAdmin
      .from('commission_records')
      .select('id, ifa_code, policy_number, transaction_date, currency')
      .eq('is_deleted', false)
      .eq('amount', 0)
      .neq('status', 'cancelled'),

    // 12. Duplicate detection
    supabaseAdmin
      .from('commission_records')
      .select('policy_number, transaction_date, platform_id, id')
      .eq('is_deleted', false)
      .neq('status', 'cancelled'),

    // 13. Platform revenue (current period)
    supabaseAdmin
      .from('commission_records')
      .select('platform_id, currency, amount, wg_amount, platforms(name)')
      .eq('is_deleted', false)
      .neq('status', 'cancelled')
      .gte('transaction_date', current.start)
      .lte('transaction_date', current.end),

    // 14. Unmapped count
    supabaseAdmin
      .from('unmapped_policies')
      .select('id', { count: 'exact', head: true }),

    // 15. Paid this month
    supabaseAdmin
      .from('payment_batches')
      .select('total_amount, currency, transaction_count')
      .gte('payment_date', monthStart),

    // 16. Prior-year 12-month trend (months 13–24 ago) for YoY overlay
    supabaseAdmin
      .from('commission_records')
      .select('transaction_date, currency, amount, wg_amount')
      .eq('is_deleted', false)
      .neq('status', 'cancelled')
      .gte('transaction_date', twentyFourMonthsAgo)
      .lt('transaction_date', twelveMonthsAgo),

    // 17. Revenue velocity: paid records with both transaction_date and paid_at
    supabaseAdmin
      .from('commission_records')
      .select('transaction_date, paid_at, created_at')
      .eq('status', 'paid')
      .eq('is_deleted', false)
      .not('paid_at', 'is', null)
      .gte('paid_at', twelveMonthsAgo),

    // 18. APE — current period (by IFA, for card + concentration column)
    supabaseAdmin
      .from('commission_records')
      .select('ifa_code, ifa_name, ape, transaction_date, policy_number')
      .not('ape', 'is', null)
      .eq('is_deleted', false)
      .gte('transaction_date', current.start)
      .lte('transaction_date', current.end),

    // 19. APE — prior period (total only, for growth %)
    supabaseAdmin
      .from('commission_records')
      .select('ape')
      .not('ape', 'is', null)
      .eq('is_deleted', false)
      .gte('transaction_date', prior.start)
      .lte('transaction_date', prior.end),

    // 20. APE — 12-month rolling trend
    supabaseAdmin
      .from('commission_records')
      .select('transaction_date, ape')
      .not('ape', 'is', null)
      .eq('is_deleted', false)
      .gte('transaction_date', twelveMonthsAgo),

    // 21. APE WGI — current period
    supabaseAdmin
      .from('commission_records')
      .select('ifa_code, ifa_name, ape_wgi, transaction_date, policy_number')
      .not('ape_wgi', 'is', null)
      .eq('is_deleted', false)
      .gte('transaction_date', current.start)
      .lte('transaction_date', current.end),

    // 22. APE WGI — prior period (total only, for growth %)
    supabaseAdmin
      .from('commission_records')
      .select('ape_wgi')
      .not('ape_wgi', 'is', null)
      .eq('is_deleted', false)
      .gte('transaction_date', prior.start)
      .lte('transaction_date', prior.end),

    // 23. APE WGI — 12-month rolling trend
    supabaseAdmin
      .from('commission_records')
      .select('transaction_date, ape_wgi')
      .not('ape_wgi', 'is', null)
      .eq('is_deleted', false)
      .gte('transaction_date', twelveMonthsAgo),
  ])

  // ── PERIOD-SCOPED: Revenue aggregation ───────────────────────────────────

  // Totals by currency for current period
  const periodTotals: Record<string, { gross: number; wgi_net: number; ifa_total: number; suspense: number; count: number }> = {}
  // Recurring = Trail + Renewal
  let recurringUSD = 0, totalUSD = 0
  // IFA revenue map for concentration
  const ifaRevenue: Record<string, { name: string; gross: number; wgi: number }> = {}
  // Active IFAs (distinct ifa_code in period)
  const activeIFASet = new Set<string>()
  // New: monthly breakdown, policy set, paid IFA total
  const byMonth: Record<string, { gross: number; wgi_net: number; ifa_total: number; count: number }> = {}
  const policySet = new Set<string>()
  let paidIFATotal = 0

  for (const r of currentPeriodRes.data ?? []) {
    const cur = (r.currency || 'USD').toUpperCase()
    if (!periodTotals[cur]) periodTotals[cur] = { gross: 0, wgi_net: 0, ifa_total: 0, suspense: 0, count: 0 }
    const e = periodTotals[cur]
    e.gross     = round2(e.gross     + (r.amount          ?? 0))
    e.wgi_net   = round2(e.wgi_net   + (r.wg_amount       ?? 0))
    e.ifa_total = round2(e.ifa_total + (r.ifa_amount      ?? 0))
    e.suspense  = round2(e.suspense  + (r.suspense_amount ?? 0))
    e.count++

    // Recurring revenue (USD only for simplicity)
    if (cur === 'USD') {
      totalUSD += r.amount ?? 0
      if (r.commission_type_code === 'Trail' || r.commission_type_code === 'Renewal') {
        recurringUSD += r.amount ?? 0
      }
    }

    // IFA concentration
    if (r.ifa_code) {
      activeIFASet.add(r.ifa_code)
      if (!ifaRevenue[r.ifa_code]) ifaRevenue[r.ifa_code] = { name: r.ifa_name ?? r.ifa_code, gross: 0, wgi: 0 }
      ifaRevenue[r.ifa_code].gross = round2(ifaRevenue[r.ifa_code].gross + (r.amount ?? 0))
      ifaRevenue[r.ifa_code].wgi   = round2(ifaRevenue[r.ifa_code].wgi   + (r.wg_amount ?? 0))
    }

    // Monthly breakdown
    const txMonth = (r as any).transaction_date?.slice(0, 7)
    if (txMonth) {
      if (!byMonth[txMonth]) byMonth[txMonth] = { gross: 0, wgi_net: 0, ifa_total: 0, count: 0 }
      byMonth[txMonth].gross     = round2(byMonth[txMonth].gross     + (r.amount     ?? 0))
      byMonth[txMonth].wgi_net   = round2(byMonth[txMonth].wgi_net   + (r.wg_amount  ?? 0))
      byMonth[txMonth].ifa_total = round2(byMonth[txMonth].ifa_total + (r.ifa_amount ?? 0))
      byMonth[txMonth].count++
    }
    if ((r as any).policy_number) policySet.add((r as any).policy_number)
    if ((r as any).status === 'paid') paidIFATotal = round2(paidIFATotal + (r.ifa_amount ?? 0))
  }

  // Revenue by commission type for current period
  const byType: Record<string, { commission_type: string; currency: string; gross: number; wgi_net: number; ifa_total: number; count: number }> = {}
  for (const r of currentPeriodRes.data ?? []) {
    const type = r.commission_type_code || r.commission_type || 'Unknown'
    const cur  = (r.currency || 'USD').toUpperCase()
    const key  = `${type}||${cur}`
    if (!byType[key]) byType[key] = { commission_type: type, currency: cur, gross: 0, wgi_net: 0, ifa_total: 0, count: 0 }
    const e = byType[key]
    e.gross     = round2(e.gross     + (r.amount     ?? 0))
    e.wgi_net   = round2(e.wgi_net   + (r.wg_amount  ?? 0))
    e.ifa_total = round2(e.ifa_total + (r.ifa_amount ?? 0))
    e.count++
  }

  // Prior period totals (USD only — for growth calculation)
  let priorGrossUSD = 0, priorWGIUSD = 0, priorIFAUSD = 0
  for (const r of priorPeriodRes.data ?? []) {
    if ((r.currency || 'USD').toUpperCase() !== 'USD') continue
    priorGrossUSD = round2(priorGrossUSD + (r.amount     ?? 0))
    priorWGIUSD   = round2(priorWGIUSD   + (r.wg_amount  ?? 0))
    priorIFAUSD   = round2(priorIFAUSD   + (r.ifa_amount ?? 0))
  }

  // Growth rates
  const currentGrossUSD = periodTotals['USD']?.gross   ?? 0
  const currentWGIUSD   = periodTotals['USD']?.wgi_net ?? 0
  const currentIFAUSD   = periodTotals['USD']?.ifa_total ?? 0

  // Recurring revenue %
  const recurringPct = totalUSD > 0 ? round2((recurringUSD / totalUSD) * 100) : 0

  // IFA concentration: top 5 by gross, as % of period total
  const sortedIFAs = Object.entries(ifaRevenue)
    .sort(([, a], [, b]) => b.gross - a.gross)
  const top5IFAs = sortedIFAs.slice(0, 5).map(([code, data]) => ({
    ifa_code: code,
    name: data.name,
    gross: data.gross,
    wgi: data.wgi,
    pct_of_total: currentGrossUSD > 0 ? round2((data.gross / currentGrossUSD) * 100) : 0,
  }))
  const top3ConcentrationPct = sortedIFAs.slice(0, 3)
    .reduce((s, [, d]) => s + d.gross, 0)
  const concentrationRisk = currentGrossUSD > 0
    ? round2((top3ConcentrationPct / currentGrossUSD) * 100)
    : 0

  // ── Pipeline ─────────────────────────────────────────────────────────────
  const pipeline: Record<string, { pending: number; approved: number; total: number }> = {}
  for (const r of pipelineRes.data ?? []) {
    const cur = (r.currency || 'USD').toUpperCase()
    if (!pipeline[cur]) pipeline[cur] = { pending: 0, approved: 0, total: 0 }
    const amt = r.ifa_amount ?? 0
    pipeline[cur].total   = round2(pipeline[cur].total + amt)
    if (r.status === 'pending')  pipeline[cur].pending  = round2(pipeline[cur].pending  + amt)
    if (r.status === 'approved') pipeline[cur].approved = round2(pipeline[cur].approved + amt)
  }

  // ── 12-month trend ────────────────────────────────────────────────────────
  const trendByMonth: Record<string, Record<string, { gross: number; wgi_net: number; ifa_total: number }>> = {}
  for (const r of trendRes.data ?? []) {
    if (!r.transaction_date) continue
    const month = r.transaction_date.slice(0, 7)
    const cur   = (r.currency || 'USD').toUpperCase()
    if (!trendByMonth[month]) trendByMonth[month] = {}
    if (!trendByMonth[month][cur]) trendByMonth[month][cur] = { gross: 0, wgi_net: 0, ifa_total: 0 }
    const e = trendByMonth[month][cur]
    e.gross     = round2(e.gross     + (r.amount     ?? 0))
    e.wgi_net   = round2(e.wgi_net   + (r.wg_amount  ?? 0))
    e.ifa_total = round2(e.ifa_total + (r.ifa_amount ?? 0))
  }

  // ── Prior-year 12-month trend (YoY overlay) ───────────────────────────────
  // Key: shift each month forward by 12 months so it aligns with the current year on the chart.
  // e.g. prior year 2025-03 is stored as 2026-03 so the x-axis matches.
  const trendPriorYear: Record<string, Record<string, { gross: number; wgi_net: number }>> = {}
  for (const r of priorYearTrendRes.data ?? []) {
    if (!r.transaction_date) continue
    const d = new Date(r.transaction_date)
    d.setFullYear(d.getFullYear() + 1) // shift to current year for alignment
    const month = d.toISOString().slice(0, 7)
    const cur   = (r.currency || 'USD').toUpperCase()
    if (!trendPriorYear[month]) trendPriorYear[month] = {}
    if (!trendPriorYear[month][cur]) trendPriorYear[month][cur] = { gross: 0, wgi_net: 0 }
    const e = trendPriorYear[month][cur]
    e.gross   = round2(e.gross   + (r.amount    ?? 0))
    e.wgi_net = round2(e.wgi_net + (r.wg_amount ?? 0))
  }

  // ── Revenue velocity (avg days: transaction_date → paid_at) ──────────────
  let velocityTotalDays = 0, velocityCount = 0
  for (const r of velocityRes.data ?? []) {
    if (!r.transaction_date || !r.paid_at) continue
    const days = Math.floor(
      (new Date(r.paid_at).getTime() - new Date(r.transaction_date).getTime()) / 86400000
    )
    if (days >= 0 && days < 365) { // exclude outliers (negative or > 1 year)
      velocityTotalDays += days
      velocityCount++
    }
  }
  const avgDaysToPayment = velocityCount > 0 ? round2(velocityTotalDays / velocityCount) : null

  // ── Status funnel ─────────────────────────────────────────────────────────
  const funnel: Record<string, { count: number; ifa_total: number }> = {}
  let pendingOldestDays = 0
  for (const r of statusFunnelRes.data ?? []) {
    const s = r.status || 'unknown'
    if (!funnel[s]) funnel[s] = { count: 0, ifa_total: 0 }
    funnel[s].count++
    funnel[s].ifa_total = round2(funnel[s].ifa_total + (r.ifa_amount ?? 0))
    if (s === 'pending' && r.created_at) {
      const age = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000)
      if (age > pendingOldestDays) pendingOldestDays = age
    }
  }

  // ── Unpaid liability ──────────────────────────────────────────────────────
  const unpaidByCurrency: Record<string, number> = {}
  for (const r of approvedRes.data ?? []) {
    const cur = (r.currency || 'USD').toUpperCase()
    unpaidByCurrency[cur] = round2((unpaidByCurrency[cur] ?? 0) + (r.unpaid ?? 0))
  }

  // ── Advance reconciliation ────────────────────────────────────────────────
  let totalAdvances = 0, reconciledAdvances = 0, unreconciledOld = 0
  const totalNonCancelled = advanceRes.data?.length ?? 0
  for (const r of advanceRes.data ?? []) {
    if (!r.is_advance) continue
    totalAdvances++
    if (r.reconciled_at) { reconciledAdvances++ }
    else {
      const age = r.created_at ? Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000) : 0
      if (age > 30) unreconciledOld++
    }
  }

  // ── ALERT: Overdue approved ───────────────────────────────────────────────
  const overdueRecords = (overdueRes.data ?? []).map(r => ({
    id: r.id, ifa_code: r.ifa_code, ifa_name: r.ifa_name, ifa_amount: r.ifa_amount, currency: r.currency,
    days_overdue: Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 86400000),
  })).sort((a, b) => b.days_overdue - a.days_overdue)

  const overdueByIFA: Record<string, { count: number; total: number; currency: string; max_days: number }> = {}
  for (const r of overdueRecords) {
    const key = r.ifa_code || 'Unknown'
    if (!overdueByIFA[key]) overdueByIFA[key] = { count: 0, total: 0, currency: r.currency, max_days: 0 }
    overdueByIFA[key].count++
    overdueByIFA[key].total = round2(overdueByIFA[key].total + (r.ifa_amount ?? 0))
    if (r.days_overdue > overdueByIFA[key].max_days) overdueByIFA[key].max_days = r.days_overdue
  }

  // ── ALERT: Allocation anomalies ───────────────────────────────────────────
  const STANDARD = 0.25, TOLERANCE = 0.01
  const allocationAnomalies = (allocationRes.data ?? []).filter(r => {
    const combined = (r.ifa_percentage ?? 0) + (r.wgi_percentage ?? 0)
    return Math.abs(combined - STANDARD) > TOLERANCE
  }).map(r => ({
    id: r.id, ifa_code: r.ifa_code, policy_number: r.policy_number,
    ifa_pct: r.ifa_percentage, wgi_pct: r.wgi_percentage,
    combined: round2((r.ifa_percentage ?? 0) + (r.wgi_percentage ?? 0)),
    amount: r.amount, currency: r.currency,
  }))

  // ── ALERT: Duplicates ────────────────────────────────────────────────────
  const policySeen = new Map<string, string[]>()
  for (const r of duplicateRes.data ?? []) {
    const k = `${r.policy_number}||${r.transaction_date}||${r.platform_id}`
    if (!policySeen.has(k)) policySeen.set(k, [])
    policySeen.get(k)!.push(r.id)
  }
  const duplicatePolicies = [...policySeen.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => {
      const [policy_number, transaction_date, platform_id] = key.split('||')
      return { policy_number, transaction_date, platform_id, record_count: ids.length, ids }
    })

  // ── Platform revenue ──────────────────────────────────────────────────────
  const platformRevenue: Record<string, { name: string; currency: string; gross: number; wgi_net: number; count: number }> = {}
  let platformTotalUSD = 0
  for (const r of platformRes.data ?? []) {
    const pid  = r.platform_id || 'unknown'
    const name = (r.platforms as any)?.name ?? pid
    const cur  = (r.currency || 'USD').toUpperCase()
    const key  = `${pid}||${cur}`
    if (!platformRevenue[key]) platformRevenue[key] = { name, currency: cur, gross: 0, wgi_net: 0, count: 0 }
    platformRevenue[key].gross   = round2(platformRevenue[key].gross   + (r.amount    ?? 0))
    platformRevenue[key].wgi_net = round2(platformRevenue[key].wgi_net + (r.wg_amount ?? 0))
    platformRevenue[key].count++
    if (cur === 'USD') platformTotalUSD += r.amount ?? 0
  }
  // Add % of total to each platform entry
  const platformList = Object.values(platformRevenue).map(p => ({
    ...p,
    pct_of_total: (p.currency === 'USD' && platformTotalUSD > 0) ? round2((p.gross / platformTotalUSD) * 100) : null,
  })).sort((a, b) => b.gross - a.gross)

  // ── Paid this month ───────────────────────────────────────────────────────
  const paidThisMonthByCurrency: Record<string, number> = {}
  let paidThisMonthTxCount = 0
  for (const r of paidMonthRes.data ?? []) {
    const cur = (r.currency || 'USD').toUpperCase()
    paidThisMonthByCurrency[cur] = round2((paidThisMonthByCurrency[cur] ?? 0) + (r.total_amount ?? 0))
    paidThisMonthTxCount += r.transaction_count ?? 0
  }

  // ── APE aggregation ───────────────────────────────────────────────────────
  let apeCurrentTotal = 0
  const apeByIFA: Record<string, { name: string; total: number; policy_count: number }> = {}
  const apeByIFAPolicies: Record<string, Set<string>> = {}
  for (const r of apeCurrentRes.data ?? []) {
    apeCurrentTotal = round2(apeCurrentTotal + (r.ape ?? 0))
    const code = r.ifa_code ?? 'Unknown'
    if (!apeByIFA[code]) apeByIFA[code] = { name: r.ifa_name ?? code, total: 0, policy_count: 0 }
    apeByIFA[code].total = round2(apeByIFA[code].total + (r.ape ?? 0))
    if (!apeByIFAPolicies[code]) apeByIFAPolicies[code] = new Set()
    if ((r as any).policy_number) apeByIFAPolicies[code].add((r as any).policy_number)
  }
  for (const code of Object.keys(apeByIFA)) {
    apeByIFA[code].policy_count = apeByIFAPolicies[code]?.size ?? 0
  }

  let apePriorTotal = 0
  for (const r of apePriorRes.data ?? []) {
    apePriorTotal = round2(apePriorTotal + (r.ape ?? 0))
  }

  const apeTrendByMonth: Record<string, number> = {}
  for (const r of apeTrendRes.data ?? []) {
    if (!r.transaction_date) continue
    const month = r.transaction_date.slice(0, 7)
    apeTrendByMonth[month] = round2((apeTrendByMonth[month] ?? 0) + (r.ape ?? 0))
  }

  // ── APE WGI aggregation ───────────────────────────────────────────────────
  let apeWgiCurrentTotal = 0
  const apeWgiByIFA: Record<string, { name: string; total: number; policy_count: number }> = {}
  const apeWgiByIFAPolicies: Record<string, Set<string>> = {}
  for (const r of apeWgiCurrentRes.data ?? []) {
    apeWgiCurrentTotal = round2(apeWgiCurrentTotal + (r.ape_wgi ?? 0))
    const code = r.ifa_code ?? 'Unknown'
    if (!apeWgiByIFA[code]) apeWgiByIFA[code] = { name: r.ifa_name ?? code, total: 0, policy_count: 0 }
    apeWgiByIFA[code].total = round2(apeWgiByIFA[code].total + (r.ape_wgi ?? 0))
    if (!apeWgiByIFAPolicies[code]) apeWgiByIFAPolicies[code] = new Set()
    if ((r as any).policy_number) apeWgiByIFAPolicies[code].add((r as any).policy_number)
  }
  for (const code of Object.keys(apeWgiByIFA)) {
    apeWgiByIFA[code].policy_count = apeWgiByIFAPolicies[code]?.size ?? 0
  }

  let apeWgiPriorTotal = 0
  for (const r of apeWgiPriorRes.data ?? []) {
    apeWgiPriorTotal = round2(apeWgiPriorTotal + (r.ape_wgi ?? 0))
  }

  const apeWgiTrendByMonth: Record<string, number> = {}
  for (const r of apeWgiTrendRes.data ?? []) {
    if (!r.transaction_date) continue
    const month = r.transaction_date.slice(0, 7)
    apeWgiTrendByMonth[month] = round2((apeWgiTrendByMonth[month] ?? 0) + (r.ape_wgi ?? 0))
  }

  // ── Compose response ──────────────────────────────────────────────────────
  return NextResponse.json({
    period: {
      key: period,
      current,
      prior,
    },

    // ── Period-scoped (changes with period selector) ──────────────────────
    revenue: {
      // Top-line totals by currency
      totals: periodTotals,
      // Growth vs prior period (USD)
      growth: {
        gross_usd:   { current: currentGrossUSD, prior: priorGrossUSD, pct: growthPct(currentGrossUSD, priorGrossUSD) },
        wgi_net_usd: { current: currentWGIUSD,   prior: priorWGIUSD,   pct: growthPct(currentWGIUSD,   priorWGIUSD)   },
        ifa_usd:     { current: currentIFAUSD,   prior: priorIFAUSD,   pct: growthPct(currentIFAUSD,   priorIFAUSD)   },
      },
      // Revenue quality
      recurring_pct: recurringPct,        // % of USD gross that is Trail or Renewal
      by_commission_type: Object.values(byType),
      by_platform: platformList,
      by_month: byMonth,
      paid_ifa_total: round2(paidIFATotal),
      policy_count: policySet.size,
    },

    // IFA performance
    ifas: {
      active_count: activeIFASet.size,    // distinct IFAs with transactions in period
      top_5: top5IFAs,
      concentration_risk_pct: concentrationRisk,  // % of revenue from top 3 IFAs
    },

    // Pipeline (point in time — not period scoped)
    pipeline,

    // 12-month rolling trend (always last 12m regardless of period)
    trend_12m: trendByMonth,
    // Prior year trend — keys shifted +12 months to align on same x-axis
    trend_prior_year: trendPriorYear,
    // Revenue velocity
    velocity: {
      avg_days_transaction_to_payment: avgDaysToPayment,
      sample_size: velocityCount,
    },

    // ── Point-in-time (not period scoped) ────────────────────────────────
    health: {
      status_funnel: funnel,
      pending_oldest_days: pendingOldestDays,
      unpaid_ifa_liability: unpaidByCurrency,
      paid_this_month: paidThisMonthByCurrency,
      paid_this_month_tx_count: paidThisMonthTxCount,
      advances: {
        total: totalAdvances,
        reconciled: reconciledAdvances,
        unreconciled_old_30d: unreconciledOld,
        reconciliation_rate_pct: totalAdvances > 0 ? round2((reconciledAdvances / totalAdvances) * 100) : 100,
      },
      manual_entry_ratio_pct: totalNonCancelled > 0 ? round2((totalAdvances / totalNonCancelled) * 100) : 0,
      unmapped_policy_count: unmappedRes.count ?? 0,
    },

    alerts: {
      overdue_approved: { total_count: overdueRecords.length, by_ifa: overdueByIFA },
      overpayments: { total_count: overpayRes.data?.length ?? 0, records: (overpayRes.data ?? []).slice(0, 50) },
      allocation_anomalies: { total_count: allocationAnomalies.length, records: allocationAnomalies.slice(0, 50) },
      zero_amount_records: { total_count: zeroAmountRes.data?.length ?? 0, records: (zeroAmountRes.data ?? []).slice(0, 50) },
      duplicate_policies: { total_count: duplicatePolicies.length, records: duplicatePolicies.slice(0, 50) },
    },

    ape: {
      total_current: apeCurrentTotal,
      total_prior:   apePriorTotal,
      growth: {
        current: apeCurrentTotal,
        prior:   apePriorTotal,
        pct:     growthPct(apeCurrentTotal, apePriorTotal),
      },
      trend_12m: apeTrendByMonth,
      by_ifa:    apeByIFA,
    },

    ape_wgi: {
      total_current: apeWgiCurrentTotal,
      total_prior:   apeWgiPriorTotal,
      growth: {
        current: apeWgiCurrentTotal,
        prior:   apeWgiPriorTotal,
        pct:     growthPct(apeWgiCurrentTotal, apeWgiPriorTotal),
      },
      trend_12m: apeWgiTrendByMonth,
      by_ifa:    apeWgiByIFA,
    },
  })
}
