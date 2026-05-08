// app/api/commission/ifa/export/route.ts
// Returns an Excel (.xlsx) file of the IFA's filtered transactions.
// Accepts same query params as /api/commission/ifa/transactions.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

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

  const { data: ifa } = await supabaseAdmin
    .from('ifas')
    .select('id, name, code')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: ifaFallback } = ifa
    ? { data: ifa }
    : await supabaseAdmin.from('ifas').select('id, name, code').ilike('email', user.email!).maybeSingle()

  if (!ifaFallback) return NextResponse.json({ error: 'No IFA account found' }, { status: 404 })

  const { searchParams } = new URL(request.url)

  let query = supabaseAdmin
    .from('commission_records')
    .select('transaction_date, commission_type, ifa_amount, currency, status, policy_number, policy_holder_name, platform:platforms(name)')
    .eq('ifa_code', ifaFallback.code)
    .eq('is_deleted', false)
    .in('status', ['approved', 'paid'])
    .order('transaction_date', { ascending: false })

  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const status = searchParams.get('status')
  const commissionType = searchParams.get('commission_type')

  if (from) query = query.gte('transaction_date', from)
  if (to) query = query.lte('transaction_date', to)
  if (status && ['approved', 'paid'].includes(status)) query = query.eq('status', status)
  if (commissionType) query = query.eq('commission_type', commissionType)

  const { data, error } = await query.limit(10000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Build Excel rows
  const rows = (data ?? []).map((t: any) => ({
    Date: t.transaction_date ?? '',
    Platform: t.platform?.name ?? '',
    'Policy Number': t.policy_number ?? '',
    'Policy Holder': t.policy_holder_name ?? '',
    'Commission Type': t.commission_type ?? '',
    'IFA Amount': t.ifa_amount ?? 0,
    Currency: t.currency ?? 'USD',
    Status: t.status ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions')

  const filename = `${ifaFallback.code}_transactions_${new Date().toISOString().split('T')[0]}.xlsx`
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
