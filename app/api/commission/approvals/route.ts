// app/api/commission/approvals/route.ts
// GET  — list all commission_records with status='pending'
// POST — bulk approve or reject a list of record ids
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

  const { data, error } = await supabaseAdmin
    .from('commission_records')
    .select(`
      id, ifa_id, ifa_code, ifa_name,
      policy_number, policy_holder_name,
      commission_type, commission_type_code,
      transaction_date, amount, ifa_amount, wg_amount,
      currency, status, created_at
    `)
    .eq('status', 'pending')
    .eq('is_deleted', false)
    .order('transaction_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Shape to match the Transaction interface consumed by the approvals page
  const transactions = (data ?? []).map(r => ({
    id: r.id,
    ifa_id: r.ifa_id,
    policy_id: null,
    commission_type_code: r.commission_type_code ?? r.commission_type,
    transaction_date: r.transaction_date,
    gross_amount: r.amount,
    ifa_amount: r.ifa_amount,
    company_amount: r.wg_amount,
    currency: r.currency,
    status: r.status,
    created_at: r.created_at,
    ifas: r.ifa_id
      ? { id: r.ifa_id, code: r.ifa_code ?? '', name: r.ifa_name ?? '' }
      : null,
    policies: r.policy_number
      ? { policy_number: r.policy_number, policy_holder_name: r.policy_holder_name ?? '' }
      : null,
  }))

  return NextResponse.json({ transactions })
}

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const { ids, action } = await request.json()
    // action: 'approve' | 'reject'
    if (!ids?.length || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'ids (array) and action (approve|reject) are required' },
        { status: 400 }
      )
    }

    const newStatus = action === 'approve' ? 'approved' : 'cancelled'

    const { error } = await supabaseAdmin
      .from('commission_records')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('is_deleted', false) // never touch soft-deleted records

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ updated: ids.length, status: newStatus })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
