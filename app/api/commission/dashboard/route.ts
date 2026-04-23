// app/api/commission/dashboard/route.ts
// Returns all admin dashboard stats using the service-role key so RLS never
// blocks counts on tables like `ifas`.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function round2(n: number) { return Math.round(n * 100) / 100 }

export async function GET(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  const now = new Date()
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const startOfYear = `${now.getFullYear()}-01-01`

  const [
    { count: totalIFAs },
    { count: pendingCount, data: pendingData },
    { data: approvedData },
    { count: unmappedCount },
    { data: paidMonthBatches },
    { data: paidYearBatches },
    { data: platformData },
    { count: totalRecords },
  ] = await Promise.all([
    // Total IFAs (all, regardless of status — admins can see them)
    supabaseAdmin
      .from('ifas')
      .select('*', { count: 'exact', head: true }),

    // Pending approval: only status='pending' (matches what the Approvals page shows)
    supabaseAdmin
      .from('commission_records')
      .select('ifa_amount', { count: 'exact' })
      .eq('status', 'pending')
      .neq('is_deleted', true),

    // Approved records: used for IFA balance aggregation (grouped by ifa_code, not ifa_id,
    // to correctly consolidate duplicate IFA records with different UUIDs)
    supabaseAdmin
      .from('commission_records')
      .select('ifa_code, ifa_name, ifa_amount')
      .eq('status', 'approved')
      .neq('is_deleted', true),

    // Unmapped policies
    supabaseAdmin
      .from('unmapped_policies')
      .select('*', { count: 'exact', head: true }),

    // Paid this calendar month (using payment_batches.payment_date for accuracy)
    supabaseAdmin
      .from('payment_batches')
      .select('total_amount')
      .gte('payment_date', startOfMonth),

    // Paid this calendar year
    supabaseAdmin
      .from('payment_batches')
      .select('total_amount')
      .gte('payment_date', startOfYear),

    // Platform distribution for pie chart
    supabaseAdmin
      .from('commission_records')
      .select('platform_id, platform:platforms ( name )')
      .not('platform_id', 'is', null)
      .neq('is_deleted', true)
      .limit(2000),

    // Total commission records (proxy for "total policies on record")
    supabaseAdmin
      .from('commission_records')
      .select('*', { count: 'exact', head: true })
      .neq('is_deleted', true),
  ])

  // Aggregate approved ifa_amount per IFA, keyed by ifa_code (not ifa_id) so that
  // duplicate IFA records with different UUIDs are correctly consolidated.
  const ifaTotals: Record<string, { name: string; total: number }> = {}
  for (const r of approvedData ?? []) {
    const key = r.ifa_code ?? 'unknown'
    if (!ifaTotals[key]) ifaTotals[key] = { name: r.ifa_name ?? 'Unknown', total: 0 }
    ifaTotals[key].total = round2(ifaTotals[key].total + (r.ifa_amount ?? 0))
  }
  const balanceArr = Object.values(ifaTotals).sort((a, b) => b.total - a.total)

  // Top 5 IFAs by approved balance (positive only)
  const topIFAs = balanceArr
    .filter(b => b.total > 0)
    .slice(0, 5)
    .map(b => ({ name: b.name.split(' ')[0], balance: b.total }))

  // Platform distribution
  const platformCounts: Record<string, number> = {}
  for (const t of platformData ?? []) {
    const name = (t.platform as any)?.name ?? 'Unknown'
    platformCounts[name] = (platformCounts[name] ?? 0) + 1
  }
  const platformPie = Object.entries(platformCounts).map(([name, value]) => ({ name, value }))

  return NextResponse.json({
    totalIFAs: totalIFAs ?? 0,
    totalRecords: totalRecords ?? 0,
    pendingApproval: pendingCount ?? 0,
    pendingApprovalSum: round2((pendingData ?? []).reduce((s, r) => s + (r.ifa_amount ?? 0), 0)),
    ifasReadyToPay: balanceArr.filter(b => b.total > 0).length,
    negativeBalanceIFAs: balanceArr.filter(b => b.total < 0).length,
    unmappedPolicies: unmappedCount ?? 0,
    paidThisMonth: round2((paidMonthBatches ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)),
    paidThisYear: round2((paidYearBatches ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)),
    topIFAs,
    platformPie,
  })
}
