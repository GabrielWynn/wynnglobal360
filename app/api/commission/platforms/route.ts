// app/api/commission/platforms/route.ts
// GET — list all platforms (id, code, name), ordered by name.
// Uses service role to bypass RLS — the anon client cannot reliably read
// this table from the browser when RLS is enabled.
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
    .from('platforms')
    .select('id, code, name')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ platforms: data ?? [] })
}
