// app/api/commission/commission-records/allocations/route.ts
// POST  — create a commission allocation: updates parent %, creates child record.
// DELETE — remove an allocation: restores parent %, soft-deletes child record.
// Admin only. Service role throughout.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── POST /api/commission/commission-records/allocations ───────────────────────
// Body: {
//   parent_record_id, secondary_ifa_id, secondary_ifa_code, secondary_ifa_name,
//   percentage (0-1 decimal), source_bucket ('wgi'|'ifa'|'suspense'), notes?
// }
export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const {
      parent_record_id,
      secondary_ifa_id,
      secondary_ifa_code,
      secondary_ifa_name,
      percentage,
      source_bucket = 'wgi',
      notes,
    } = await request.json()

    // Resolve the IFA record id for the acting admin (created_by FK → ifas.id)
    const { data: actorIfa } = await supabaseAdmin
      .from('ifas')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    const actorIfaId: string | null = actorIfa?.id ?? null

    if (!parent_record_id || !secondary_ifa_code || !percentage) {
      return NextResponse.json(
        { error: 'parent_record_id, secondary_ifa_code, and percentage are required' },
        { status: 400 }
      )
    }

    if (percentage <= 0 || percentage > 1) {
      return NextResponse.json(
        { error: 'percentage must be between 0 and 1 (exclusive/inclusive)' },
        { status: 400 }
      )
    }

    if (!['wgi', 'ifa', 'suspense'].includes(source_bucket)) {
      return NextResponse.json(
        { error: "source_bucket must be 'wgi', 'ifa', or 'suspense'" },
        { status: 400 }
      )
    }

    // ── Fetch parent record ────────────────────────────────────────────────────
    const { data: parent, error: parentErr } = await supabaseAdmin
      .from('commission_records')
      .select('id, amount, currency, ifa_percentage, suspense_percentage, wgi_percentage, transaction_date, policy_number, policy_holder_name, commission_type, commission_type_code, platform_id, ifa_code, ifa_name, allocation_parent_id')
      .eq('id', parent_record_id)
      .single()

    if (parentErr || !parent) {
      return NextResponse.json({ error: 'Parent record not found' }, { status: 404 })
    }

    // Disallow allocating from a child record
    if (parent.allocation_parent_id) {
      return NextResponse.json(
        { error: 'Cannot create an allocation from a child allocation record' },
        { status: 400 }
      )
    }

    // ── Validate available % in the source bucket ──────────────────────────────
    const bucketField =
      source_bucket === 'wgi'      ? 'wgi_percentage'
      : source_bucket === 'ifa'    ? 'ifa_percentage'
      :                              'suspense_percentage'

    const currentBucketPct: number = (parent as any)[bucketField] ?? 0

    // Sum up existing allocations already drawing from this bucket
    const { data: existingAllocs, error: allocErr } = await supabaseAdmin
      .from('commission_allocations')
      .select('percentage')
      .eq('parent_record_id', parent_record_id)
      .eq('source_bucket', source_bucket)

    if (allocErr) {
      return NextResponse.json({ error: allocErr.message }, { status: 500 })
    }

    const alreadyAllocated = (existingAllocs ?? []).reduce(
      (sum: number, a: any) => sum + (a.percentage ?? 0), 0
    )
    const available = currentBucketPct - alreadyAllocated

    if (percentage > available + 1e-9) {
      return NextResponse.json(
        {
          error: `Not enough ${source_bucket.toUpperCase()} % available. Available: ${(available * 100).toFixed(4)}%, requested: ${(percentage * 100).toFixed(4)}%`,
        },
        { status: 400 }
      )
    }

    // ── Create child commission_record for secondary IFA ──────────────────────
    const { data: child, error: childErr } = await supabaseAdmin
      .from('commission_records')
      .insert({
        transaction_date:    parent.transaction_date,
        policy_number:       parent.policy_number,
        policy_holder_name:  parent.policy_holder_name,
        commission_type:     parent.commission_type,
        commission_type_code: parent.commission_type_code,
        platform_id:         parent.platform_id,
        amount:              parent.amount,
        currency:            parent.currency,
        ifa_id:              secondary_ifa_id ?? null,
        ifa_code:            secondary_ifa_code,
        ifa_name:            secondary_ifa_name ?? null,
        ifa_percentage:      percentage,
        wgi_percentage:      0,
        suspense_percentage: 0,
        paid:                0,
        status:              'pending',
        allocation_parent_id: parent_record_id,
        notes: notes
          ? `Allocation from ${parent.ifa_code ?? 'parent'}: ${notes}`
          : `Allocation from ${parent.ifa_code ?? 'parent record'}`,
      })
      .select('*, platform:platforms(name), upload_batch:csv_upload_batches(filename)')
      .single()

    if (childErr || !child) {
      return NextResponse.json(
        { error: `Failed to create child record: ${childErr?.message}` },
        { status: 500 }
      )
    }

    // ── Update parent: subtract percentage from source bucket ─────────────────
    const newBucketPct = Math.max(0, currentBucketPct - percentage)
    const { data: updatedParent, error: patchErr } = await supabaseAdmin
      .from('commission_records')
      .update({ [bucketField]: newBucketPct, updated_at: new Date().toISOString() })
      .eq('id', parent_record_id)
      .select('*, platform:platforms(name), upload_batch:csv_upload_batches(filename)')
      .single()

    if (patchErr) {
      // Rollback child on parent patch failure
      await supabaseAdmin.from('commission_records').update({ is_deleted: true }).eq('id', child.id)
      return NextResponse.json({ error: patchErr.message }, { status: 500 })
    }

    // ── Insert commission_allocations row ──────────────────────────────────────
    const { data: allocation, error: allocInsertErr } = await supabaseAdmin
      .from('commission_allocations')
      .insert({
        parent_record_id,
        child_record_id:   child.id,
        secondary_ifa_id:  secondary_ifa_id ?? null,
        secondary_ifa_code,
        secondary_ifa_name: secondary_ifa_name ?? null,
        percentage,
        source_bucket,
        notes: notes ?? null,
        created_by: actorIfaId,
      })
      .select()
      .single()

    if (allocInsertErr) {
      // Rollback: soft-delete child and restore parent %
      await supabaseAdmin.from('commission_records').update({ is_deleted: true }).eq('id', child.id)
      await supabaseAdmin.from('commission_records')
        .update({ [bucketField]: currentBucketPct, updated_at: new Date().toISOString() })
        .eq('id', parent_record_id)
      return NextResponse.json({ error: allocInsertErr.message }, { status: 500 })
    }

    return NextResponse.json({
      allocation,
      parent:  updatedParent,
      child,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── DELETE /api/commission/commission-records/allocations?id=<allocationId> ───
export async function DELETE(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const { searchParams } = new URL(request.url)
    const allocationId = searchParams.get('id')
    if (!allocationId) {
      return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
    }

    // ── Fetch allocation ───────────────────────────────────────────────────────
    const { data: alloc, error: allocErr } = await supabaseAdmin
      .from('commission_allocations')
      .select('id, parent_record_id, child_record_id, percentage, source_bucket')
      .eq('id', allocationId)
      .single()

    if (allocErr || !alloc) {
      return NextResponse.json({ error: 'Allocation not found' }, { status: 404 })
    }

    // ── Soft-delete child record ───────────────────────────────────────────────
    if (alloc.child_record_id) {
      await supabaseAdmin
        .from('commission_records')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('id', alloc.child_record_id)
    }

    // ── Restore parent source bucket % ────────────────────────────────────────
    const bucketField =
      alloc.source_bucket === 'wgi'      ? 'wgi_percentage'
      : alloc.source_bucket === 'ifa'    ? 'ifa_percentage'
      :                                    'suspense_percentage'

    const { data: parentCurrent, error: parentFetchErr } = await supabaseAdmin
      .from('commission_records')
      .select('id, ifa_percentage, wgi_percentage, suspense_percentage')
      .eq('id', alloc.parent_record_id)
      .single()

    if (parentFetchErr || !parentCurrent) {
      return NextResponse.json({ error: 'Parent record not found' }, { status: 404 })
    }

    const restoredPct = ((parentCurrent as any)[bucketField] ?? 0) + alloc.percentage

    const { data: updatedParent, error: patchErr } = await supabaseAdmin
      .from('commission_records')
      .update({ [bucketField]: restoredPct, updated_at: new Date().toISOString() })
      .eq('id', alloc.parent_record_id)
      .select('*, platform:platforms(name), upload_batch:csv_upload_batches(filename)')
      .single()

    if (patchErr) {
      return NextResponse.json({ error: patchErr.message }, { status: 500 })
    }

    // ── Delete allocation row ──────────────────────────────────────────────────
    const { error: deleteErr } = await supabaseAdmin
      .from('commission_allocations')
      .delete()
      .eq('id', allocationId)

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }

    return NextResponse.json({ deleted: allocationId, parent: updatedParent })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
