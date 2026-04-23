// app/api/commission/ifa/ape/route.ts
// Returns APE (Annual Premium Equivalent) summary for the authenticated IFA.
// Only includes records where ape IS NOT NULL.
// Query params: year (default = current year), group_by (month | quarter | year)
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(authHeader.slice(7))
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Resolve IFA — try user_id first, fall back to email
  const { data: ifaByUser } = await supabaseAdmin
    .from('ifas')
    .select('id, code')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: ifaRecord } = ifaByUser
    ? { data: ifaByUser }
    : await supabaseAdmin.from('ifas').select('id, code').ilike('email', user.email!).maybeSingle()

  if (!ifaRecord) {
    return NextResponse.json({ error: 'No IFA account found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const year    = searchParams.get('year')    ?? new Date().getFullYear().toString()
  const groupBy = searchParams.get('group_by') ?? 'month'

  const { data, error } = await supabaseAdmin
    .from('commission_records')
    .select('ape, transaction_date')
    .eq('ifa_code', ifaRecord.code)
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
