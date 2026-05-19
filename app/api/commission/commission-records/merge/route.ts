// app/api/commission/commission-records/merge/route.ts
// POST — merge manually selected commission rows into one survivor (admin only).
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type Row = {
  id: string
  policy_number: string
  ifa_code: string | null
  currency: string
  platform_id: string | null
  amount: number
  variable_amount: number | null
  paid: number
  ifa_amount: number
  suspense_amount: number
  wg_amount: number
  ape: number | null
  ape_wgi: number | null
  due_wg: number | null
  platform_payment_pct: number | null
  rate: number | null
  status: string
  is_deleted: boolean
  is_advance: boolean
  linked_record_id: string | null
  allocation_parent_id: string | null
  payment_batch_id: string | null
  transaction_date: string
  commencement_date: string | null
  commission_type: string | null
  notes: string | null
  ifa_notes: string | null
  ifa_percentage: number
  suspense_percentage: number
  wgi_percentage: number
  allocations?: { id: string }[]
  merge_source_ids?: string[] | null
}

const SELECT =
  'id, policy_number, ifa_code, currency, platform_id, amount, variable_amount, paid, ifa_amount, suspense_amount, wg_amount, ape, ape_wgi, due_wg, platform_payment_pct, rate, status, is_deleted, is_advance, linked_record_id, allocation_parent_id, payment_batch_id, transaction_date, commencement_date, commission_type, notes, ifa_notes, ifa_percentage, suspense_percentage, wgi_percentage, merge_source_ids, allocations:commission_allocations!parent_record_id(id)'

function normPolicy(p: string) {
  return p.trim().toUpperCase()
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function round6(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000
}

function sumNullable(rows: Row[], field: keyof Row): number {
  return rows.reduce((s, r) => s + (Number(r[field] ?? 0) || 0), 0)
}

function weightedAvg(rows: Row[], field: 'platform_payment_pct' | 'rate'): number | null {
  let totalWeight = 0
  let weighted = 0
  for (const r of rows) {
    const v = r[field]
    if (v == null) continue
    const w = Math.abs(r.amount ?? 0)
    if (w <= 0) continue
    weighted += v * w
    totalWeight += w
  }
  if (totalWeight <= 0) {
    const survivor = rows[0]
    return survivor[field] ?? null
  }
  return round6(weighted / totalWeight)
}

function mergeStatus(rows: Row[]): string {
  if (rows.some(r => r.status === 'cancelled')) {
    throw new Error('Cannot merge cancelled records')
  }
  if (rows.some(r => r.status === 'reconciled')) {
    throw new Error('Cannot merge reconciled records — use the reconcile workflow')
  }
  if (rows.every(r => r.status === 'paid')) return 'paid'
  if (rows.some(r => r.status === 'pending')) return 'pending'
  if (rows.every(r => r.status === 'approved')) return 'approved'
  // Mixed approved / paid
  const mergedIfa = sumNullable(rows, 'ifa_amount')
  const mergedPaid = sumNullable(rows, 'paid')
  if (mergedPaid >= mergedIfa - 0.005) return 'paid'
  return 'approved'
}

function mergeCommissionType(rows: Row[]): string | null {
  const types = [...new Set(rows.map(r => r.commission_type?.trim()).filter(Boolean) as string[])]
  if (types.length === 0) return null
  if (types.length === 1) return types[0]
  return types.join(' + ')
}

function mergeNotes(rows: Row[], survivorId: string, field: 'notes' | 'ifa_notes'): string | null {
  const parts: string[] = []
  for (const r of rows) {
    const text = r[field]?.trim()
    if (!text) continue
    parts.push(text)
  }
  if (parts.length === 0) return null
  const unique = [...new Set(parts)]
  const body = unique.join(' | ')
  const sourceIds = rows.filter(r => r.id !== survivorId).map(r => r.id)
  if (sourceIds.length === 0) return body
  return `[merged ${sourceIds.length} row(s)] ${body}`.slice(0, 4000)
}

function validateMergeGroup(rows: Row[], survivorId: string) {
  if (rows.length < 2) {
    throw new Error('Select at least 2 records to merge')
  }
  if (!rows.some(r => r.id === survivorId)) {
    throw new Error('survivor_id must be one of the selected records')
  }

  const policy = normPolicy(rows[0].policy_number)
  const ifaCode = rows[0].ifa_code
  const currency = rows[0].currency
  const platformId = rows[0].platform_id

  for (const r of rows) {
    if (r.is_deleted) throw new Error('Cannot merge deleted records')
    if (r.allocation_parent_id) throw new Error('Cannot merge allocation child rows')
    if ((r.allocations?.length ?? 0) > 0) {
      throw new Error(`Record ${r.policy_number} has commission allocations — remove allocations first`)
    }
    if (r.linked_record_id) throw new Error('Cannot merge advance/reconcile linked records')
    if (r.is_advance) throw new Error('Cannot merge advance payment rows')
    if (r.payment_batch_id) throw new Error('Cannot merge records that are part of a payment batch')
    if (normPolicy(r.policy_number) !== policy) {
      throw new Error('All selected records must have the same policy number')
    }
    if (r.ifa_code !== ifaCode) {
      throw new Error('All selected records must belong to the same IFA')
    }
    if (r.currency !== currency) {
      throw new Error('All selected records must use the same currency')
    }
    if (r.platform_id !== platformId) {
      throw new Error('All selected records must use the same platform')
    }
  }
}

function buildMergedUpdate(rows: Row[], survivor: Row) {
  const sumAmount = round2(sumNullable(rows, 'amount'))
  const sumIfaAmt = sumNullable(rows, 'ifa_amount')
  const sumSuspAmt = sumNullable(rows, 'suspense_amount')
  const sumWgAmt = sumNullable(rows, 'wg_amount')

  let ifaPct = survivor.ifa_percentage
  let suspPct = survivor.suspense_percentage
  let wgiPct = survivor.wgi_percentage

  if (Math.abs(sumAmount) > 1e-9) {
    ifaPct = round6(sumIfaAmt / sumAmount)
    suspPct = round6(sumSuspAmt / sumAmount)
    wgiPct = round6(sumWgAmt / sumAmount)
  } else if (sumIfaAmt !== 0 || sumSuspAmt !== 0 || sumWgAmt !== 0) {
    throw new Error('Cannot merge: total received is zero but commission amounts are non-zero')
  }

  const latestDate = rows
    .map(r => r.transaction_date)
    .sort()
    .reverse()[0]

  const commencement =
    rows.map(r => r.commencement_date).filter(Boolean).sort().reverse()[0] ?? survivor.commencement_date

  const sourceIds = rows.filter(r => r.id !== survivor.id).map(r => r.id)
  const existingSources = survivor.merge_source_ids ?? []

  const sumApe = round2(sumNullable(rows, 'ape'))
  const sumApeWgi = round2(sumNullable(rows, 'ape_wgi'))
  const sumDueWg = round2(sumNullable(rows, 'due_wg'))

  return {
    amount: sumAmount,
    variable_amount: round2(sumNullable(rows, 'variable_amount')),
    paid: round2(sumNullable(rows, 'paid')),
    ape: rows.some(r => r.ape != null) ? sumApe : null,
    ape_wgi: rows.some(r => r.ape_wgi != null) ? sumApeWgi : null,
    due_wg: rows.some(r => r.due_wg != null) ? sumDueWg : null,
    ifa_percentage: ifaPct,
    suspense_percentage: suspPct,
    wgi_percentage: wgiPct,
    platform_payment_pct: weightedAvg(rows, 'platform_payment_pct'),
    rate: weightedAvg(rows, 'rate'),
    status: mergeStatus(rows),
    transaction_date: latestDate,
    commencement_date: commencement,
    commission_type: mergeCommissionType(rows),
    notes: mergeNotes(rows, survivor.id, 'notes'),
    ifa_notes: mergeNotes(rows, survivor.id, 'ifa_notes'),
    merge_source_ids: [...existingSources, ...sourceIds],
    updated_at: new Date().toISOString(),
  }
}

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  let actorEmail = `${userId}@local`
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
    actorEmail = data.user?.email ?? actorEmail
  } catch {
    /* keep fallback */
  }

  try {
    const { ids, survivor_id } = await request.json()

    if (!Array.isArray(ids) || ids.length < 2) {
      return NextResponse.json({ error: 'ids must contain at least 2 record IDs' }, { status: 400 })
    }
    if (!survivor_id || typeof survivor_id !== 'string') {
      return NextResponse.json({ error: 'survivor_id is required' }, { status: 400 })
    }

    const uniqueIds = [...new Set(ids as string[])]
    if (uniqueIds.length !== ids.length) {
      return NextResponse.json({ error: 'ids must not contain duplicates' }, { status: 400 })
    }

    const { data: rows, error: fetchErr } = await supabaseAdmin
      .from('commission_records')
      .select(SELECT)
      .in('id', uniqueIds)

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!rows || rows.length !== uniqueIds.length) {
      return NextResponse.json({ error: 'One or more records were not found' }, { status: 404 })
    }

    const typed = rows as Row[]
    validateMergeGroup(typed, survivor_id)

    const survivor = typed.find(r => r.id === survivor_id)!
    const merged = buildMergedUpdate(typed, survivor)
    const now = new Date().toISOString()
    const absorbedIds = typed.filter(r => r.id !== survivor_id).map(r => r.id)

    const { error: updateErr } = await supabaseAdmin
      .from('commission_records')
      .update(merged)
      .eq('id', survivor_id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    if (absorbedIds.length > 0) {
      const { error: absorbErr } = await supabaseAdmin
        .from('commission_records')
        .update({
          is_deleted: true,
          merged_into_id: survivor_id,
          merged_at: now,
          updated_at: now,
        })
        .in('id', absorbedIds)

      if (absorbErr) {
        return NextResponse.json(
          { error: `Survivor updated but failed to retire merged rows: ${absorbErr.message}` },
          { status: 500 }
        )
      }
    }

    const { data: record, error: freshErr } = await supabaseAdmin
      .from('commission_records')
      .select('*, platform:platforms(name), upload_batch:csv_upload_batches(filename), allocations:commission_allocations!parent_record_id(*)')
      .eq('id', survivor_id)
      .single()

    if (freshErr) return NextResponse.json({ error: freshErr.message }, { status: 500 })

    try {
      await supabaseAdmin.from('admin_audit_log').insert({
        actor_id: userId,
        actor_email: actorEmail,
        action: 'commission.record.merge',
        target_id: survivor_id,
        before_data: {
          table_name: 'commission_records',
          policy_number: survivor.policy_number,
          merged_ids: absorbedIds,
        },
        after_data: {
          table_name: 'commission_records',
          policy_number: survivor.policy_number,
          survivor_id,
          merged_count: absorbedIds.length,
          merge_source_ids: merged.merge_source_ids,
        },
      })
    } catch {
      /* best-effort */
    }

    return NextResponse.json({
      record,
      merged_count: absorbedIds.length,
      survivor_id,
    })
  } catch (err: any) {
    const message = err?.message ?? 'Merge failed'
    const status = message.includes('Cannot merge') || message.includes('must') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
