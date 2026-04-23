// app/api/commission/payments/history/route.ts
// GET — recent payment batches (default: current calendar month)
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
  const from = searchParams.get('from') ?? new Date().toISOString().slice(0, 7) + '-01' // default: start of month

  const { data, error } = await supabaseAdmin
    .from('payment_batches')
    .select(`
      id, ifa_id, total_amount, currency,
      payment_reference, payment_date,
      transaction_count, status, created_at,
      ifas ( id, code, name, email )
    `)
    .gte('payment_date', from)
    .order('payment_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const batches = (data ?? []).map(b => {
    const ifa = b.ifas
      ? (Array.isArray(b.ifas) ? b.ifas[0] : b.ifas) as { id: string; code: string; name: string; email: string }
      : null
    return {
      id: b.id,
      ifa: {
        id: b.ifa_id,
        code: ifa?.code ?? '',
        name: ifa?.name ?? b.ifa_id,
        email: ifa?.email ?? '',
      },
      total_amount: b.total_amount,
      currency: b.currency,
      payment_reference: b.payment_reference,
      payment_date: b.payment_date,
      transaction_count: b.transaction_count,
      status: b.status,
    }
  })

  return NextResponse.json({ batches })
}
