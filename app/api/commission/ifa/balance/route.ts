// app/api/commission/ifa/balance/route.ts
// Returns aggregated balance stats for the authenticated IFA.
// Uses service role so the result is correct even when duplicate IFA records
// exist (we query by ifa_code, not ifa_id).
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

  // Fetch all non-deleted records for this IFA (by code — immune to UUID mismatches)
  const { data: records, error } = await supabaseAdmin
    .from('commission_records')
    .select('ifa_amount, paid, status, is_advance')
    .eq('ifa_code', ifaRecord.code)
    .eq('is_deleted', false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const r = records ?? []
  return NextResponse.json({
    current_balance:   r.filter(x => x.status === 'approved').reduce((s, x) => s + (x.ifa_amount ?? 0), 0),
    suspended_balance: r.filter(x => x.status === 'pending' ).reduce((s, x) => s + (x.ifa_amount ?? 0), 0),
    // Exclude advance records from total_earned — an advance is a prepayment of a future
    // commission, not a separate earned amount. Including both the advance and the reconciled
    // statement it covers would double-count the same commission.
    total_earned:      r.filter(x => x.status !== 'cancelled' && !x.is_advance).reduce((s, x) => s + (x.ifa_amount ?? 0), 0),
    // Exclude advances from total_paid as well — the "paid" on an advance is internal
    // bookkeeping; the reconciled statement's ifa_amount reflects the actual disbursement.
    total_paid:        r.filter(x => x.status === 'paid' && !x.is_advance).reduce((s, x) => s + (x.paid ?? 0), 0),
  })
}
