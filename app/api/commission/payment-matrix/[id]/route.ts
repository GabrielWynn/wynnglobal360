// app/api/commission/payment-matrix/[id]/route.ts
// Server-side API route — uses service role to bypass RLS for admin operations
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// PUT /api/commission/payment-matrix/[id] — full update of a rule
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  const { id } = await params
  const body = await request.json()

  const { data, error } = await supabaseAdmin
    .from('payment_matrix_rules')
    .update(body)
    .eq('id', id)
    .select('*, platform:platforms(code, name), ifa:ifas(code, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

// PATCH /api/commission/payment-matrix/[id] — partial update (e.g. toggle is_active)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  const { id } = await params
  const body = await request.json()

  const { data, error } = await supabaseAdmin
    .from('payment_matrix_rules')
    .update(body)
    .eq('id', id)
    .select('id, is_active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

// DELETE /api/commission/payment-matrix/[id] — delete a rule
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  const { id } = await params
  const { error } = await supabaseAdmin
    .from('payment_matrix_rules')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
