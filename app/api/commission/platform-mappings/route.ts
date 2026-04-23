// app/api/commission/platform-mappings/route.ts
// GET  ?platform_id=xxx  — fetch saved column mapping for a platform
// POST               — create a new column mapping
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
  const platformId = searchParams.get('platform_id')

  if (!platformId) {
    return NextResponse.json({ error: 'platform_id is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('platform_column_mappings')
    .select('*')
    .eq('platform_id', platformId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mapping: data })
}

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  try {
    const body = await request.json()
    const {
      platform_id,
      policy_number_col,
      amount_col,
      date_col,
      commission_type_col,
      currency_col,
      policy_holder_col,
      commencement_date_col,
      payment_pct_col,
      default_currency,
    } = body

    if (!platform_id || !policy_number_col || !amount_col || !date_col) {
      return NextResponse.json(
        { error: 'platform_id, policy_number_col, amount_col, date_col are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('platform_column_mappings')
      .insert({
        platform_id,
        policy_number_col,
        amount_col,
        date_col,
        commission_type_col: commission_type_col || null,
        currency_col: currency_col || null,
        policy_holder_col: policy_holder_col || null,
        commencement_date_col: commencement_date_col || null,
        payment_pct_col: payment_pct_col || null,
        default_currency: default_currency || 'USD',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ mapping: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
