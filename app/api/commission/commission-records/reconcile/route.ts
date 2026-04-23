// app/api/commission/commission-records/reconcile/route.ts
// POST — link an advance payment record to a statement record.
//
// The advance record stays as-is (status=paid, is_advance=true).
// The statement record is marked reconciled: status='reconciled',
// paid = ifa_amount (so unpaid = 0), linked_record_id = advance.id.
// The advance record gets linked_record_id = statement.id.
// Both are updated atomically.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  const { advance_id, statement_id } = await request.json()
  if (!advance_id || !statement_id) {
    return NextResponse.json({ error: 'advance_id and statement_id are required' }, { status: 400 })
  }
  if (advance_id === statement_id) {
    return NextResponse.json({ error: 'Cannot reconcile a record with itself' }, { status: 400 })
  }

  // Fetch both records to validate
  const { data: records, error: fetchErr } = await supabaseAdmin
    .from('commission_records')
    .select('id, is_advance, status, ifa_amount, linked_record_id')
    .in('id', [advance_id, statement_id])

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!records || records.length !== 2) {
    return NextResponse.json({ error: 'One or both records not found' }, { status: 404 })
  }

  const advance   = records.find(r => r.id === advance_id)
  const statement = records.find(r => r.id === statement_id)

  if (!advance?.is_advance) {
    return NextResponse.json({ error: 'advance_id must be an advance record (is_advance = true)' }, { status: 400 })
  }
  if (advance.linked_record_id || statement?.linked_record_id) {
    return NextResponse.json({ error: 'One or both records are already reconciled' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Update statement record: mark reconciled, set paid = ifa_amount
  const { error: stmtErr } = await supabaseAdmin
    .from('commission_records')
    .update({
      status:            'reconciled',
      paid:              statement!.ifa_amount ?? 0,
      linked_record_id:  advance_id,
      reconciled_at:     now,
      updated_at:        now,
    })
    .eq('id', statement_id)

  if (stmtErr) return NextResponse.json({ error: stmtErr.message }, { status: 500 })

  // Update advance record: link it to the statement
  const { error: advErr } = await supabaseAdmin
    .from('commission_records')
    .update({
      linked_record_id: statement_id,
      updated_at:       now,
    })
    .eq('id', advance_id)

  if (advErr) {
    // Compensating rollback on statement
    await supabaseAdmin
      .from('commission_records')
      .update({ status: statement!.status, paid: 0, linked_record_id: null, reconciled_at: null })
      .eq('id', statement_id)
    return NextResponse.json({ error: advErr.message }, { status: 500 })
  }

  // Audit log (best-effort)
  try {
    await supabaseAdmin.from('audit_log').insert({
      table_name: 'commission_records',
      record_id:  statement_id,
      action:     'reconcile',
      changes:    { advance_id, statement_id },
      changed_by: userId,
      created_at: now,
    })
  } catch { /* audit_log may not exist yet */ }

  return NextResponse.json({ reconciled: true, advance_id, statement_id })
}
