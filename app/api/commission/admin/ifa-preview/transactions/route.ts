// app/api/commission/admin/ifa-preview/transactions/route.ts
// Returns transactions for any IFA, for admin preview.
// Requires admin auth. Accepts ifa_code + filter params.
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

  let query = supabaseAdmin
    .from('commission_records')
    .select(`
      id, transaction_date, commission_type,
      ifa_amount, paid, ifa_code, currency, status,
      policy_number, policy_holder_name, ape, ifa_notes,
      platform_id,
      platform:platforms ( name )
    `)
    .eq('ifa_code', ifaCode)
    .eq('is_deleted', false)
    .in('status', ['approved', 'paid'])
    .order('transaction_date', { ascending: false })

  const from       = searchParams.get('from')
  const to         = searchParams.get('to')
  const platformId = searchParams.get('platform_id')
  const commType   = searchParams.get('commission_type')
  const status     = searchParams.get('status')
  const policyNum  = searchParams.get('policy_number')

  if (from)       query = query.gte('transaction_date', from)
  if (to)         query = query.lte('transaction_date', to)
  if (status && ['approved', 'paid'].includes(status)) query = query.eq('status', status)
  if (commType)   query = query.ilike('commission_type', `%${commType}%`)
  if (policyNum)  query = query.ilike('policy_number', `%${policyNum}%`)
  if (platformId) query = query.eq('platform_id', platformId)

  const { data, error } = await query.limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ transactions: data ?? [] })
}
