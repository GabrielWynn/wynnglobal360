// app/api/commission/kpi-config/route.ts
// GET  — return all KPI config entries
// PATCH — update a single entry by key
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
    .from('kpi_config')
    .select('key, value, label, description, category, updated_at')
    .order('category')
    .order('key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}

export async function PATCH(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const { key, value } = await request.json()

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('kpi_config')
      .update({ value: String(value), updated_by: userId, updated_at: new Date().toISOString() })
      .eq('key', key)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Audit log (best-effort)
    try {
      await supabaseAdmin.from('audit_log').insert({
        table_name: 'kpi_config',
        record_id: '00000000-0000-0000-0000-000000000000', // no UUID PK — use zero UUID
        action: 'config_update',
        new_value: { key, value },
        performed_by: userId,
      })
    } catch { /* audit_log may not exist */ }

    return NextResponse.json({ config: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
