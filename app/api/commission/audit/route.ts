// app/api/commission/audit/route.ts
// Admin-only endpoint to read the audit log.
// GET ?policy=RS02...&from=2026-01-01&to=2026-03-31&page=1

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PAGE_SIZE = 100

export async function GET(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  const { searchParams } = new URL(request.url)
  const policy   = searchParams.get('policy')?.trim() || null
  const recordId = searchParams.get('record_id')?.trim() || null
  const action   = searchParams.get('action')?.trim() || null
  const from     = searchParams.get('from')?.trim() || null
  const to       = searchParams.get('to')?.trim() || null
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1'))

  let q = supabaseAdmin
    .from('admin_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (recordId) q = q.eq('target_id', recordId)
  if (action)   q = q.eq('action', action)
  if (from)     q = q.gte('created_at', `${from}T00:00:00Z`)
  if (to)       q = q.lte('created_at', `${to}T23:59:59Z`)

  const { data, count, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const logs = (data ?? [])
    .filter((row: any) => {
      if (!policy) return true
      const policyValue = row?.after_data?.policy_number ?? row?.before_data?.policy_number ?? ''
      return String(policyValue).toLowerCase().includes(policy.toLowerCase())
    })
    .map((row: any) => ({
      id: row.id,
      record_id: row.target_id,
      policy_number: row?.after_data?.policy_number ?? row?.before_data?.policy_number ?? null,
      action: row.action,
      changes: row?.after_data?.changes ?? null,
      changed_by: row.actor_id,
      user_email: row.actor_email,
      created_at: row.created_at,
    }))

  return NextResponse.json({ logs, total: policy ? logs.length : (count ?? 0), page, pageSize: PAGE_SIZE })
}
