// app/api/commission/approvals/[id]/route.ts
// PATCH — approve, reject, or override a single commission record
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const { id: paramId } = await params
    const { action, ifa_amount, override_reason } = await request.json()
    // action: 'approve' | 'reject' | 'override'

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    // Fetch current record
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('commission_records')
      .select('ifa_id, ifa_amount, amount, ifa_percentage, status')
      .eq('id', paramId)
      .single()

    if (fetchError || !current) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    let updates: Record<string, unknown> = {}

    if (action === 'approve') {
      updates = { status: 'approved' }
    } else if (action === 'reject') {
      updates = { status: 'cancelled' }
    } else if (action === 'override') {
      if (ifa_amount === undefined) {
        return NextResponse.json({ error: 'ifa_amount is required for override' }, { status: 400 })
      }
      const desiredAmount = Number(ifa_amount)
      const grossAmount = current.amount ?? 0

      // ifa_amount is a GENERATED ALWAYS AS column — cannot be set directly.
      // Compute the implied ifa_percentage that produces the desired amount.
      const impliedPercentage = grossAmount > 0
        ? Math.round((desiredAmount / grossAmount) * 10000) / 10000
        : 0

      updates = {
        status: 'approved',
        ifa_percentage: impliedPercentage,
      }
    } else {
      return NextResponse.json(
        { error: 'action must be approve, reject, or override' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('commission_records')
      .update(updates)
      .eq('id', paramId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Audit log entry (best-effort — table may not exist yet)
    try {
      await supabaseAdmin.from('audit_log').insert({
        table_name: 'commission_records',
        record_id: paramId,
        action,
        old_value: { status: current.status, ifa_amount: current.ifa_amount, ifa_percentage: current.ifa_percentage },
        new_value: updates,
        override_reason: override_reason ?? null,
        performed_at: new Date().toISOString(),
      })
    } catch { /* audit_log may not exist yet */ }

    return NextResponse.json({ transaction: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
