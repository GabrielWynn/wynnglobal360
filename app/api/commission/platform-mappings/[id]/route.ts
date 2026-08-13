// app/api/commission/platform-mappings/[id]/route.ts
// PUT — update an existing column mapping
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  try {
    const { id } = await params
    const body = await request.json()
    const {
      policy_number_col,
      amount_col,
      date_col,
      commission_type_col,
      currency_col,
      policy_holder_col,
      commencement_date_col,
      payment_pct_col,
      type2_col,
      default_currency,
    } = body

    if (!policy_number_col || !amount_col || !date_col) {
      return NextResponse.json(
        { error: 'policy_number_col, amount_col, date_col are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('platform_column_mappings')
      .update({
        policy_number_col,
        amount_col,
        date_col,
        commission_type_col: commission_type_col || null,
        currency_col: currency_col || null,
        policy_holder_col: policy_holder_col || null,
        commencement_date_col: commencement_date_col || null,
        payment_pct_col: payment_pct_col || null,
        type2_col: type2_col || null,
        default_currency: default_currency || 'USD',
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ mapping: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
