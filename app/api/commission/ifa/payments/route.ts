// app/api/commission/ifa/payments/route.ts
// Returns payment history for the authenticated IFA.
// Uses service role so RLS never blocks the query.
// Looks up all IFA UUIDs sharing the same ifa_code so historical payment_batches
// created before canonical-IFA enrichment (with temp IFA UUIDs) are included.
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

  // Find all IFA UUIDs sharing the same code (handles duplicate IFA records)
  const { data: allIFAsForCode } = await supabaseAdmin
    .from('ifas')
    .select('id')
    .eq('code', ifaRecord.code)

  const allIds = (allIFAsForCode ?? []).map(r => r.id)

  const { data: payments, error } = await supabaseAdmin
    .from('payment_batches')
    .select('id, total_amount, currency, payment_reference, payment_date, transaction_count')
    .in('ifa_id', allIds.length ? allIds : ['no-match'])
    .order('payment_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ payments: payments ?? [] })
}
