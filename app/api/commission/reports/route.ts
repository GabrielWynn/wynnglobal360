// app/api/commission/reports/route.ts
// ?type=monthly_ifa | monthly_platform | ytd | unmapped | payments | ape
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const ifaId = searchParams.get('ifa_id')
  const year = searchParams.get('year') ?? new Date().getFullYear().toString()

  try {
    switch (type) {
      case 'monthly_ifa': {
        // Total IFA amounts grouped by IFA code + month (for selected year)
        const { data, error } = await supabaseAdmin
          .from('commission_records')
          .select('ifa_code, ifa_name, ifa_amount, currency, transaction_date')
          .eq('status', 'paid')
          .eq('is_deleted', false)
          .gte('transaction_date', `${year}-01-01`)
          .lte('transaction_date', `${year}-12-31`)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        // Group: { ifa_code → { month → { total, name, currency } } }
        const grouped: Record<string, Record<string, { total: number; name: string; currency: string }>> = {}
        for (const t of data ?? []) {
          const code  = t.ifa_code ?? 'Unknown'
          const name  = t.ifa_name ?? code
          const month = t.transaction_date?.slice(0, 7) ?? 'Unknown'
          if (!grouped[code]) grouped[code] = {}
          if (!grouped[code][month]) grouped[code][month] = { total: 0, name, currency: t.currency ?? 'USD' }
          grouped[code][month].total += t.ifa_amount ?? 0
        }

        return NextResponse.json({ report: grouped })
      }

      case 'monthly_platform': {
        const { data, error } = await supabaseAdmin
          .from('commission_records')
          .select('ifa_amount, amount, currency, transaction_date, platform:platforms(name)')
          .eq('status', 'paid')
          .eq('is_deleted', false)
          .gte('transaction_date', `${year}-01-01`)
          .lte('transaction_date', `${year}-12-31`)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        const grouped: Record<string, Record<string, { ifa_total: number; gross_total: number; currency: string }>> = {}
        for (const t of data ?? []) {
          const platform = (t.platform as any)?.name ?? 'Unknown'
          const month    = t.transaction_date?.slice(0, 7) ?? 'Unknown'
          if (!grouped[platform]) grouped[platform] = {}
          if (!grouped[platform][month]) grouped[platform][month] = { ifa_total: 0, gross_total: 0, currency: t.currency ?? 'USD' }
          grouped[platform][month].ifa_total   += t.ifa_amount ?? 0
          grouped[platform][month].gross_total += t.amount ?? 0
        }

        return NextResponse.json({ report: grouped })
      }

      case 'ytd': {
        const { data, error } = await supabaseAdmin
          .from('commission_records')
          .select('ifa_code, ifa_name, ifa_amount, currency')
          .eq('status', 'paid')
          .eq('is_deleted', false)
          .gte('transaction_date', `${year}-01-01`)
          .lte('transaction_date', `${year}-12-31`)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        // Group by code → currency → total (multi-currency safe)
        const ytd: Record<string, { name: string; totals: Record<string, number> }> = {}
        for (const t of data ?? []) {
          const code     = t.ifa_code ?? 'Unknown'
          const name     = t.ifa_name ?? code
          const currency = (t.currency ?? 'USD').toUpperCase()
          if (!ytd[code]) ytd[code] = { name, totals: {} }
          ytd[code].totals[currency] = (ytd[code].totals[currency] ?? 0) + (t.ifa_amount ?? 0)
        }

        return NextResponse.json({ report: ytd })
      }

      case 'unmapped': {
        const { data, error } = await supabaseAdmin
          .from('unmapped_policies')
          .select('id, policy_number, policy_holder_name, status, created_at, platforms ( name )')
          .order('created_at', { ascending: false })

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ report: data ?? [] })
      }

      case 'payments': {
        let query = supabaseAdmin
          .from('payment_batches')
          .select(`
            id, total_amount, currency, payment_reference, payment_date,
            transaction_count, status, created_at,
            ifas ( code, name )
          `)
          .order('payment_date', { ascending: false })

        if (ifaId) query = query.eq('ifa_id', ifaId)
        const { data, error } = await query
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ report: data ?? [] })
      }

      case 'ape': {
        // APE by IFA, grouped by month | quarter | year within the selected year.
        // Only includes records where ape IS NOT NULL.
        const groupBy  = searchParams.get('group_by') ?? 'month'
        const dateFrom = `${year}-01-01`
        const dateTo   = `${year}-12-31`

        const { data, error } = await supabaseAdmin
          .from('commission_records')
          .select('ifa_code, ifa_name, ape, transaction_date')
          .not('ape', 'is', null)
          .eq('is_deleted', false)
          .gte('transaction_date', dateFrom)
          .lte('transaction_date', dateTo)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        const getPeriod = (date: string): string => {
          if (groupBy === 'year')    return date.slice(0, 4)
          if (groupBy === 'quarter') {
            const q = Math.ceil(parseInt(date.slice(5, 7)) / 3)
            return `${date.slice(0, 4)}-Q${q}`
          }
          return date.slice(0, 7) // month: YYYY-MM
        }

        const grouped: Record<string, { name: string; periods: Record<string, number> }> = {}
        for (const t of data ?? []) {
          const code   = t.ifa_code ?? 'Unknown'
          const name   = t.ifa_name ?? code
          const period = getPeriod(t.transaction_date ?? '')
          if (!grouped[code]) grouped[code] = { name, periods: {} }
          grouped[code].periods[period] = (grouped[code].periods[period] ?? 0) + (t.ape ?? 0)
        }

        return NextResponse.json({ report: grouped })
      }

      default:
        return NextResponse.json(
          { error: 'type must be monthly_ifa | monthly_platform | ytd | unmapped | payments | ape' },
          { status: 400 }
        )
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
