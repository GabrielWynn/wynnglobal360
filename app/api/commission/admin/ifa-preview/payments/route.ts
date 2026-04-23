// app/api/commission/admin/ifa-preview/payments/route.ts
// Returns payment history for any IFA, for admin preview.
// Requires admin auth. Accepts ifa_code as a query param.
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

  // Find all IFA UUIDs sharing the same code (handles duplicate IFA records)
  const { data: allIFAsForCode } = await supabaseAdmin
    .from('ifas')
    .select('id')
    .eq('code', ifaCode)

  const allIds = (allIFAsForCode ?? []).map(r => r.id)

  const { data: payments, error } = await supabaseAdmin
    .from('payment_batches')
    .select('id, total_amount, currency, payment_reference, payment_date, transaction_count')
    .in('ifa_id', allIds.length ? allIds : ['no-match'])
    .order('payment_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ payments: payments ?? [] })
}
