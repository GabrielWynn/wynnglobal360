// app/api/commission/ifas/route.ts
// GET  — list all IFAs with balance and auth-link status
// POST — create IFA + send Supabase email invite
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

  // Fetch IFAs (no stale ifa_balances join)
  const { data: ifas, error } = await supabaseAdmin
    .from('ifas')
    .select('id, code, name, email, status, role, user_id')
    .neq('role', 'admin')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch live commission aggregates from commission_records.
  // Aggregate by ifa_code (not ifa_id) so balances are correct even when
  // duplicate IFA records exist with different UUIDs for the same IFA code.
  const { data: records } = await supabaseAdmin
    .from('commission_records')
    .select('ifa_code, ifa_amount, status')
    .eq('is_deleted', false)
    .neq('status', 'cancelled')

  const balanceMap = new Map<string, { current_balance: number; total_paid: number; total_earned: number }>()
  for (const rec of records ?? []) {
    if (!rec.ifa_code) continue
    if (!balanceMap.has(rec.ifa_code)) {
      balanceMap.set(rec.ifa_code, { current_balance: 0, total_paid: 0, total_earned: 0 })
    }
    const b = balanceMap.get(rec.ifa_code)!
    const amt = rec.ifa_amount ?? 0
    b.total_earned += amt
    if (rec.status === 'approved') b.current_balance += amt
    if (rec.status === 'paid') b.total_paid += amt
  }

  // Merge into same shape frontend expects: ifa_balances[0]
  const result = (ifas ?? []).map(ifa => {
    const b = balanceMap.get(ifa.code) ?? { current_balance: 0, total_paid: 0, total_earned: 0 }
    return {
      ...ifa,
      ifa_balances: [{
        current_balance: b.current_balance,
        suspended_balance: 0,
        total_earned: b.total_earned,
        total_paid: b.total_paid,
      }],
    }
  })

  return NextResponse.json({ ifas: result })
}

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  try {
    const { code, name, email, status = 'active' } = await request.json()

    if (!code || !name || !email) {
      return NextResponse.json({ error: 'code, name and email are required' }, { status: 400 })
    }

    // Create IFA record
    const { data: ifa, error: ifaError } = await supabaseAdmin
      .from('ifas')
      .insert({ code, name, email, status, role: 'ifa' })
      .select()
      .single()

    if (ifaError) return NextResponse.json({ error: ifaError.message }, { status: 500 })

    // Note: no ifa_balances insert — balances are computed live from commission_records

    // Send Supabase Auth invite email
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://wgi-comm-ifa.vercel.app'}/accept-invite`,
      data: { ifa_id: ifa.id, role: 'ifa' },
    })

    const inviteSent = !inviteError
    if (inviteError) console.warn(`Invite email failed for ${email}:`, inviteError.message)

    return NextResponse.json({ ifa, invite_sent: inviteSent })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
