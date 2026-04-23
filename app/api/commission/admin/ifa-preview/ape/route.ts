// app/api/commission/admin/ifa-preview/ape/route.ts
// Returns APE summary for any IFA, for admin preview.
// Requires admin auth. Accepts ifa_code, year, group_by as query params.
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
  const ifaCode = searchParams.get('ifa_code')
  if (!ifaCode) return NextResponse.json({ error: 'ifa_code required' }, { status: 400 })

  const year    = searchParams.get('year')     ?? new Date().getFullYear().toString()
  const groupBy = searchParams.get('group_by') ?? 'month'

  const { data, error } = await supabaseAdmin
    .from('commission_records')
    .select('ape, transaction_date')
    .eq('ifa_code', ifaCode)
    .eq('is_deleted', false)
    .not('ape', 'is', null)
    .gte('transaction_date', `${year}-01-01`)
    .lte('transaction_date', `${year}-12-31`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const getPeriod = (date: string): string => {
    if (groupBy === 'year')    return date.slice(0, 4)
    if (groupBy === 'quarter') {
      const q = Math.ceil(parseInt(date.slice(5, 7)) / 3)
      return `${date.slice(0, 4)}-Q${q}`
    }
    return date.slice(0, 7) // YYYY-MM
  }

  const periodMap: Record<string, number> = {}
  let total = 0
  for (const r of data ?? []) {
    const period = getPeriod(r.transaction_date ?? '')
    periodMap[period] = (periodMap[period] ?? 0) + (r.ape ?? 0)
    total += r.ape ?? 0
  }

  const periods = Object.entries(periodMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, ape]) => ({ period, ape }))

  return NextResponse.json({ total, periods })
}
