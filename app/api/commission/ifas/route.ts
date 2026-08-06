// app/api/commission/ifas/route.ts
// GET  — list all IFAs with balance and auth-link status
// POST — create IFA + send Supabase email invite
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'
import { getResendClient, EMAIL_FROM } from '@/lib/email/resend'
import { renderInviteEmail, renderPasswordResetEmail } from '@/lib/email/templates'

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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    // Generate the invite link via Supabase Auth (this creates the auth user
    // but does NOT send an email) and deliver a Wynn Global-branded email via
    // Resend ourselves, instead of Supabase's built-in mailer.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${siteUrl}/accept-invite`, data: { ifa_id: ifa.id, role: 'ifa' } },
    })

    let inviteSent = false
    let alreadyRegistered = false

    if (linkError) {
      console.warn(`generateLink(invite) failed for ${email}:`, linkError.message)
      alreadyRegistered = /already.*registered/i.test(linkError.message)
    } else {
      const { error: sendError } = await getResendClient().emails.send({
        from: EMAIL_FROM,
        to: email,
        subject: "You've been invited to Wynn Global 360",
        html: renderInviteEmail({ name, actionLink: linkData.properties.action_link }),
      })
      inviteSent = !sendError
      if (sendError) console.warn(`Resend invite send failed for ${email}:`, sendError.message)
    }

    // The email already has a Supabase Auth account (e.g. a former IFA re-added
    // under the same address) — generateLink({type:'invite'}) rejects those like
    // inviteUserByEmail does, so send a password-reset link instead. That account
    // gets linked to this new ifas row automatically on next login via
    // /api/auth/link-ifa.
    if (!inviteSent && alreadyRegistered) {
      const { data: resetLinkData, error: resetLinkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${siteUrl}/reset-password` },
      })
      if (resetLinkError) {
        console.warn(`generateLink(recovery) failed for ${email}:`, resetLinkError.message)
      } else {
        const { error: sendError } = await getResendClient().emails.send({
          from: EMAIL_FROM,
          to: email,
          subject: 'Reset your Wynn Global 360 password',
          html: renderPasswordResetEmail({ actionLink: resetLinkData.properties.action_link }),
        })
        inviteSent = !sendError
        if (sendError) console.warn(`Resend reset-send failed for ${email}:`, sendError.message)
      }
    }

    return NextResponse.json({ ifa, invite_sent: inviteSent, already_registered: alreadyRegistered })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
