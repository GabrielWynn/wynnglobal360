// app/api/commission/ifa-notes/route.ts
// PATCH — save advisor notes for an IFA (keyed by ifa_code)
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function PATCH(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const { ifa_code, notes } = await request.json()

    if (!ifa_code) {
      return NextResponse.json({ error: 'ifa_code is required' }, { status: 400 })
    }

    // Update all IFA records with this code (handles duplicate UUID rows)
    const { error } = await supabaseAdmin
      .from('ifas')
      .update({ advisor_notes: notes ?? null })
      .eq('code', ifa_code)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
