// app/api/commission/payment-matrix/route.ts
// Server-side API route — uses service role to bypass RLS for admin operations
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET /api/commission/payment-matrix — list all rules with platform and IFA names
export async function GET(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  const { data, error } = await supabaseAdmin
    .from('payment_matrix_rules')
    .select('*, platform:platforms(code, name), ifa:ifas(code, name)')
    .order('is_active', { ascending: false })
    .order('platform_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/commission/payment-matrix — create a new rule
export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  const body = await request.json()

  const { data, error } = await supabaseAdmin
    .from('payment_matrix_rules')
    .insert(body)
    .select('*, platform:platforms(code, name), ifa:ifas(code, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
