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
  pending_amount: number
  ape: number | null
  ape_wgi: number | null
  due_wg: number | null
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
  ifa_percentage: number | null
  suspense_percentage: number | null
  wgi_percentage: number | null
  pending_percentage: number | null
  is_agent_adjustment: boolean
  agent_adjustment_id: string | null
  allocations?: { id: string }[]
  merge_source_ids?: string[] | null
}

const SELECT =
  'id, policy_number, ifa_code, currency, platform_id, amount, variable_amount, paid, ifa_amount, suspense_amount, wg_amount, pending_amount, ape, ape_wgi, due_wg, rate, status, is_deleted, is_advance, linked_record_id, allocation_parent_id, payment_batch_id, transaction_date, commencement_date, commission_type, notes, ifa_notes, ifa_percentage, suspense_percentage, wgi_percentage, pending_percentage, is_agent_adjustment, agent_adjustment_id, merge_source_ids, allocations:commission_allocations!parent_record_id(id)'

/** Rule violations the admin can fix by changing the selection — returned as 400, not 500. */
class MergeValidationError extends Error {}

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

function weightedAvg(rows: Row[], survivor: Row, field: 'rate'): number | null {
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
  if (totalWeight <= 0) return survivor[field] ?? null
  return round6(weighted / totalWeight)
}

function mergeStatus(rows: Row[], tiebreakRows: Row[] = rows): string {
  if (rows.some(r => r.status === 'cancelled')) {
    throw new MergeValidationError('Cannot merge cancelled records')
  }
  if (rows.some(r => r.status === 'reconciled')) {
    throw new MergeValidationError('Cannot merge reconciled records — use the reconcile workflow')
  }
  if (rows.every(r => r.status === 'paid')) return 'paid'
  if (rows.some(r => r.status === 'pending')) return 'pending'
  if (rows.every(r => r.status === 'approved')) return 'approved'
  // Mixed approved / paid
  const mergedIfa = sumNullable(tiebreakRows, 'ifa_amount')
  const mergedPaid = sumNullable(tiebreakRows, 'paid')
  if (mergedPaid >= mergedIfa - 0.005) return 'paid'
  return 'approved'
}

function mergeCommissionType(rows: Row[]): string | null {
  const types = [...new Set(rows.map(r => r.commission_type?.trim()).filter(Boolean) as string[])]
  if (types.length === 0) return null
  if (types.length === 1) return types[0]
  return types.join(' + ')
}

const MERGE_TAG = /^(\[merged \d+ row\(s\)\]\s*)+/

/** `mergedCount` null = no "[merged N row(s)]" tag (ifa_notes is shown to the IFA; the tag is internal). */
function mergeNotes(rows: Row[], field: 'notes' | 'ifa_notes', mergedCount: number | null): string | null {
  const parts: string[] = []
  for (const r of rows) {
    // A survivor of an earlier merge already carries the tag and ' | '-joined parts —
    // unpack it so re-merging neither stacks tags nor repeats a note.
    const text = r[field]?.trim().replace(MERGE_TAG, '')
    if (!text) continue
    for (const p of text.split(' | ')) {
      if (p.trim()) parts.push(p.trim())
    }
  }
  if (parts.length === 0) return null
  const body = [...new Set(parts)].join(' | ')
  if (mergedCount == null) return body.slice(0, 4000)
  return `[merged ${mergedCount} row(s)] ${body}`.slice(0, 4000)
}

function validateMergeGroup(rows: Row[], survivorId: string) {
  if (rows.length < 2) {
    throw new MergeValidationError('Select at least 2 records to merge')
  }
  if (!rows.some(r => r.id === survivorId)) {
    throw new MergeValidationError('survivor_id must be one of the selected records')
  }

  const policy = normPolicy(rows[0].policy_number)
  const ifaCode = rows[0].ifa_code
  const currency = rows[0].currency
  const platformId = rows[0].platform_id

  for (const r of rows) {
    if (r.is_deleted) throw new MergeValidationError('Cannot merge deleted records')
    if (r.allocation_parent_id) throw new MergeValidationError('Cannot merge allocation child rows')
    if ((r.allocations?.length ?? 0) > 0) {
      throw new MergeValidationError(`Record ${r.policy_number} has commission allocations — remove allocations first`)
    }
    if (r.linked_record_id) throw new MergeValidationError('Cannot merge advance/reconcile linked records')
    if (r.is_advance) throw new MergeValidationError('Cannot merge advance payment rows')
    if (r.payment_batch_id) throw new MergeValidationError('Cannot merge records that are part of a payment batch')
    if (r.is_agent_adjustment) throw new MergeValidationError('Cannot merge Agent Adjustment rows')
    // The retired row would keep its link (and its Due WG) on the Agent Adjustment
    // while the survivor carries the summed Due WG — the adjustment would be over-allocated.
    if (r.agent_adjustment_id) {
      throw new MergeValidationError(
        `Record ${r.policy_number} has Due WG allocated to an Agent Adjustment — unlink it first`
      )
    }
    if (normPolicy(r.policy_number) !== policy) {
      throw new MergeValidationError('All selected records must have the same policy number')
    }
    if (r.ifa_code !== ifaCode) {
      throw new MergeValidationError('All selected records must belong to the same IFA')
    }
    if (r.currency !== currency) {
      throw new MergeValidationError('All selected records must use the same currency')
    }
    if (r.platform_id !== platformId) {
      throw new MergeValidationError('All selected records must use the same platform')
    }
  }
}

function buildMergedUpdate(rows: Row[], survivor: Row, mode: 'sum' | 'keep_amount') {
  const latestDate = rows
    .map(r => r.transaction_date)
    .sort()
    .reverse()[0]

  const commencement =
    rows.map(r => r.commencement_date).filter(Boolean).sort().reverse()[0] ?? survivor.commencement_date

  const sourceIds = rows.filter(r => r.id !== survivor.id).map(r => r.id)
  const mergeSourceIds = [...(survivor.merge_source_ids ?? []), ...sourceIds]

  const tiebreakRows = mode === 'keep_amount' ? [survivor] : rows

  const base = {
    status: mergeStatus(rows, tiebreakRows),
    transaction_date: latestDate,
    commencement_date: commencement,
    commission_type: mergeCommissionType(rows),
    notes: mergeNotes(rows, 'notes', mergeSourceIds.length),
    ifa_notes: mergeNotes(rows, 'ifa_notes', null),
    merge_source_ids: mergeSourceIds,
  }

  if (mode === 'keep_amount') {
    // amount/variable_amount/paid/ape/ape_wgi/due_wg/ifa_percentage/suspense_percentage/
    // wgi_percentage/pending_percentage/rate are intentionally omitted — the survivor's pre-merge
    // values stand, and Postgres recomputes the generated columns (ifa_amount, unpaid, etc.) from them unchanged.
    return base
  }

  const sumAmount = round2(sumNullable(rows, 'amount'))
  const sumVariable = round2(sumNullable(rows, 'variable_amount'))
  const sumIfaAmt = sumNullable(rows, 'ifa_amount')
  const sumSuspAmt = sumNullable(rows, 'suspense_amount')
  const sumWgAmt = sumNullable(rows, 'wg_amount')
  const sumPendingAmt = sumNullable(rows, 'pending_amount')

  let ifaPct = survivor.ifa_percentage
  let suspPct = survivor.suspense_percentage
  let wgiPct = survivor.wgi_percentage
  let pendingPct = survivor.pending_percentage

  // The generated split columns are Gross (Received + Expect) × percentage, so the
  // blended percentage has to be derived from Gross too — dividing by Received alone
  // inflates every split whenever a row carries an Expect amount.
  const sumGross = round2(sumAmount + sumVariable)

  // A percentage that is blank (null) on every row means "split not assigned yet" —
  // keep it blank rather than writing 0%, which reads as a deliberate zero split.
  const blend = (sum: number, field: 'ifa_percentage' | 'suspense_percentage' | 'wgi_percentage' | 'pending_percentage') =>
    rows.every(r => r[field] == null) ? null : round6(sum / sumGross)

  if (Math.abs(sumGross) > 1e-9) {
    ifaPct = blend(sumIfaAmt, 'ifa_percentage')
    suspPct = blend(sumSuspAmt, 'suspense_percentage')
    wgiPct = blend(sumWgAmt, 'wgi_percentage')
    pendingPct = blend(sumPendingAmt, 'pending_percentage')
  } else if (sumIfaAmt !== 0 || sumSuspAmt !== 0 || sumWgAmt !== 0 || sumPendingAmt !== 0) {
    throw new MergeValidationError('Cannot merge: total gross is zero but commission amounts are non-zero')
  }

  const sumApe = round2(sumNullable(rows, 'ape'))
  const sumApeWgi = round2(sumNullable(rows, 'ape_wgi'))
  const sumDueWg = round2(sumNullable(rows, 'due_wg'))

  return {
    ...base,
    amount: sumAmount,
    variable_amount: sumVariable,
    paid: round2(sumNullable(rows, 'paid')),
    ape: rows.some(r => r.ape != null) ? sumApe : null,
    ape_wgi: rows.some(r => r.ape_wgi != null) ? sumApeWgi : null,
    due_wg: rows.some(r => r.due_wg != null) ? sumDueWg : null,
    ifa_percentage: ifaPct,
    suspense_percentage: suspPct,
    wgi_percentage: wgiPct,
    pending_percentage: pendingPct,
    rate: weightedAvg(rows, survivor, 'rate'),
  }
}

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  let actorEmail = `${userId}@local`
  // admin_audit_log.actor_id references ifas(id), not the auth user id — inserting
  // userId there violates the FK and the merge entry is silently lost.
  let actorIfaId: string | null = null
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
    actorEmail = data.user?.email ?? actorEmail
    const { data: byUserId } = await supabaseAdmin.from('ifas').select('id').eq('user_id', userId).maybeSingle()
    actorIfaId = byUserId?.id ?? null
    if (!actorIfaId && data.user?.email) {
      const { data: byEmail } = await supabaseAdmin.from('ifas').select('id').eq('email', data.user.email).maybeSingle()
      actorIfaId = byEmail?.id ?? null
    }
  } catch {
    /* keep fallback */
  }

  try {
    const { ids, survivor_id, merge_mode } = await request.json()

    if (!Array.isArray(ids) || ids.length < 2) {
      return NextResponse.json({ error: 'ids must contain at least 2 record IDs' }, { status: 400 })
    }
    if (!survivor_id || typeof survivor_id !== 'string') {
      return NextResponse.json({ error: 'survivor_id is required' }, { status: 400 })
    }
    if (merge_mode != null && merge_mode !== 'sum' && merge_mode !== 'keep_amount') {
      return NextResponse.json({ error: `merge_mode must be 'sum' or 'keep_amount'` }, { status: 400 })
    }
    const mode: 'sum' | 'keep_amount' = merge_mode === 'keep_amount' ? 'keep_amount' : 'sum'

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
    const merged = buildMergedUpdate(typed, survivor, mode)
    const absorbedIds = typed.filter(r => r.id !== survivor_id).map(r => r.id)

    // One transaction: the survivor update and the retirement of the absorbed rows either
    // both land or neither does — a half-applied merge would double-count the money.
    // The function also re-checks, under row locks, that no selected row was deleted or
    // merged since it was read above (P0001).
    const { error: mergeErr } = await supabaseAdmin.rpc('merge_commission_records', {
      p_survivor_id: survivor_id,
      p_absorbed_ids: absorbedIds,
      p_update: merged,
    })

    if (mergeErr) {
      return NextResponse.json({ error: mergeErr.message }, { status: mergeErr.code === 'P0001' ? 409 : 500 })
    }

    const { data: record, error: freshErr } = await supabaseAdmin
      .from('commission_records')
      .select('*, platform:platforms(name), upload_batch:csv_upload_batches(filename), allocations:commission_allocations!parent_record_id(*)')
      .eq('id', survivor_id)
      .single()

    if (freshErr) return NextResponse.json({ error: freshErr.message }, { status: 500 })

    try {
      // supabase-js reports failures via the returned error, it does not throw.
      const { error: auditErr } = await supabaseAdmin.from('admin_audit_log').insert({
        actor_id: actorIfaId,
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
          merge_mode: mode,
        },
      })
      if (auditErr) console.error('[commission merge] audit log insert failed:', auditErr.message)
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
    const status = err instanceof MergeValidationError ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
