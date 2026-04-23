// app/api/commission/ifas/[id]/route.ts
// PUT   — update IFA (name, code, email, status)
// PATCH — resend invite email
// DELETE — hard-delete IFA; re-links commission_records + payment_batches to canonical sibling first
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
    const { code, name, email, status } = await request.json()

    const { data, error } = await supabaseAdmin
      .from('ifas')
      .update({ code, name, email, status })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ifa: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  // PATCH is used to resend the invite email
  try {
    const { id } = await params
    const { data: ifa, error: fetchError } = await supabaseAdmin
      .from('ifas')
      .select('email')
      .eq('id', id)
      .single()

    if (fetchError || !ifa) {
      return NextResponse.json({ error: 'IFA not found' }, { status: 404 })
    }

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(ifa.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://wgi-comm-ifa.vercel.app'}/accept-invite`,
      data: { ifa_id: id, role: 'ifa' },
    })

    if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 })
    return NextResponse.json({ invite_sent: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  const { id } = await params

  // Fetch the IFA being deleted
  const { data: ifa, error: fetchErr } = await supabaseAdmin
    .from('ifas')
    .select('id, code, user_id')
    .eq('id', id)
    .single()

  if (fetchErr || !ifa) return NextResponse.json({ error: 'IFA not found' }, { status: 404 })

  // Find sibling IFAs with the same code (potential canonical records)
  const { data: siblings } = await supabaseAdmin
    .from('ifas')
    .select('id, email, user_id')
    .eq('code', ifa.code)
    .neq('id', id)

  // Pick best canonical: prefer user_id set, then non-temp email
  const canonical = ((siblings ?? []).sort((a: any, b: any) => {
    const score = (x: any) => (x.user_id ? 2 : 0) + (!x.email?.includes('@temp.com') ? 1 : 0)
    return score(b) - score(a)
  })[0]) ?? null

  // Re-link commission_records and payment_batches to canonical IFA UUID
  if (canonical) {
    await supabaseAdmin
      .from('commission_records')
      .update({ ifa_id: canonical.id })
      .eq('ifa_id', id)

    await supabaseAdmin
      .from('payment_batches')
      .update({ ifa_id: canonical.id })
      .eq('ifa_id', id)
  }

  // Delete linked auth user if any
  if (ifa.user_id) {
    await supabaseAdmin.auth.admin.deleteUser(ifa.user_id)
  }

  // Hard-delete the IFA row
  const { error } = await supabaseAdmin
    .from('ifas')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true, reassigned_to: canonical?.id ?? null })
}
