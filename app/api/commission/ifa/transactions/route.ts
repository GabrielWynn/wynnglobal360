// app/api/commission/ifa/transactions/route.ts
// Server-side filtered transaction query for the IFA portal.
// Validates the caller's session and only returns their own data.
// Query params: from, to, platform_id, commission_type, status, policy_number
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Anon client to verify the caller's session
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: Request) {
  // Verify caller session
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(authHeader.slice(7))
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Resolve IFA for this user — try user_id first, fall back to email
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

  // Build query against commission_records.
  // Filter by ifa_code (denormalized column) rather than ifa_id so that data is
  // always found even when duplicate IFA records exist with different UUIDs.
  let query = supabaseAdmin
    .from('commission_records')
    .select(`
      id, transaction_date, commission_type,
      ifa_amount, paid, ifa_code, currency, status,
      policy_number, policy_holder_name, ape, ifa_notes,
      platform_id,
      platform:platforms ( name )
    `)
    .eq('ifa_code', ifaRecord.code)
    .eq('is_deleted', false)
    .in('status', ['approved', 'paid'])   // IFAs never see pending or cancelled
    .order('transaction_date', { ascending: false })

  const from        = searchParams.get('from')
  const to          = searchParams.get('to')
  const platformId  = searchParams.get('platform_id')
  const commType    = searchParams.get('commission_type')
  const status      = searchParams.get('status')
  const policyNum   = searchParams.get('policy_number')

  if (from)       query = query.gte('transaction_date', from)
  if (to)         query = query.lte('transaction_date', to)
  if (status && ['approved', 'paid'].includes(status)) query = query.eq('status', status)
  if (commType)   query = query.ilike('commission_type', `%${commType}%`)
  if (policyNum)  query = query.ilike('policy_number', `%${policyNum}%`)
  if (platformId) query = query.eq('platform_id', platformId)  // direct column — no post-fetch filter needed

  const { data, error } = await query.limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ transactions: data ?? [] })
}
