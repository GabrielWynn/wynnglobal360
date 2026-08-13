// app/api/commission/commission-records/route.ts
// GET   — paginated load of all commission_records for the master file (admin only).
// PATCH — update one or more records by ID (single cell edit or bulk formula/status).
// POST  — insert a new commission record manually.
// All handlers use service role so RLS never interferes with admin access.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PAGE = 1000

export async function GET(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  const { searchParams } = new URL(request.url)
  const includeDeleted = searchParams.get('include_deleted') === 'true'

  try {
    let allData: any[] = []
    let from = 0

    while (true) {
      let q = supabaseAdmin
        .from('commission_records')
        .select('*, platform:platforms(name), upload_batch:csv_upload_batches(filename), allocations:commission_allocations!parent_record_id(*)')
        .order('transaction_date', { ascending: false })
        .range(from, from + PAGE - 1)

      if (!includeDeleted) q = q.eq('is_deleted', false)

      const { data: page, error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!page || page.length === 0) break
      allData = allData.concat(page)
      if (page.length < PAGE) break
      from += PAGE
    }

    return NextResponse.json({ records: allData })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Whitelist of fields editable from the master file.
// Prevents arbitrary column overwrites via the API.
const EDITABLE_FIELDS = new Set([
  'ifa_percentage', 'suspense_percentage', 'wgi_percentage', 'pending_percentage',
  'variable_amount', 'ape', 'ape_wgi', 'due_wg',
  'paid', 'paid_at', 'status', 'rate', 'notes', 'ifa_notes', 'type2', 'updated_at',
])

export async function PATCH(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const { ids, updates, mark_paid } = await request.json()

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
    }

    // Special case: set paid = ifa_amount (computed column) for each record individually
    if (mark_paid) {
      const { data: records, error: fetchErr } = await supabaseAdmin
        .from('commission_records')
        .select('id, ifa_amount')
        .in('id', ids)

      if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

      const paidAt = new Date().toISOString()
      const results = await Promise.all(
        (records ?? []).map(r =>
          supabaseAdmin.from('commission_records')
            .update({ paid: r.ifa_amount, status: 'paid', paid_at: paidAt, updated_at: paidAt })
            .eq('id', r.id)
        )
      )
      const failed = results.filter(r => r.error).length
      if (failed > 0) return NextResponse.json({ error: `${failed} record(s) failed to update` }, { status: 500 })
      return NextResponse.json({ updated: ids.length })
    }

    // Standard field update — strip any fields not on the whitelist
    const safeUpdates: Record<string, unknown> = {}
    for (const key of Object.keys(updates ?? {})) {
      if (EDITABLE_FIELDS.has(key)) safeUpdates[key] = updates[key]
    }
    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('commission_records')
      .update(safeUpdates)
      .in('id', ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // For single-record cell edits, return the refreshed row so the grid updates inline
    if (ids.length === 1) {
      const { data: fresh } = await supabaseAdmin
        .from('commission_records')
        .select('*, platform:platforms(name), upload_batch:csv_upload_batches(filename), allocations:commission_allocations!parent_record_id(*)')
        .eq('id', ids[0])
        .single()
      return NextResponse.json({ updated: 1, record: fresh ?? null })
    }

    return NextResponse.json({ updated: ids.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const record = await request.json()
    const { error } = await supabaseAdmin
      .from('commission_records')
      .insert({ ...record, created_by: userId })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
