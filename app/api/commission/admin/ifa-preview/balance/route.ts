// app/api/commission/admin/ifa-preview/balance/route.ts
// Returns aggregated balance stats for any IFA, for admin preview.
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

  const { data: records, error } = await supabaseAdmin
    .from('commission_records')
    .select('ifa_amount, paid, status')
    .eq('ifa_code', ifaCode)
    .eq('is_deleted', false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const r = records ?? []
  return NextResponse.json({
    current_balance:   r.filter(x => x.status === 'approved').reduce((s, x) => s + (x.ifa_amount ?? 0), 0),
    suspended_balance: r.filter(x => x.status === 'pending' ).reduce((s, x) => s + (x.ifa_amount ?? 0), 0),
    total_earned:      r.filter(x => x.status !== 'cancelled').reduce((s, x) => s + (x.ifa_amount ?? 0), 0),
    total_paid:        r.filter(x => x.status === 'paid'     ).reduce((s, x) => s + (x.paid       ?? 0), 0),
  })
}
