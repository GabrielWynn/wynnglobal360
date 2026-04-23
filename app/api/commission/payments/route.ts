// app/api/commission/payments/route.ts
// GET  — fetch approved-balance summary per IFA, grouped by currency
// POST — mark approved records as paid and create a payment_batches record
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/** Round to 2 decimal places to avoid floating-point drift when accumulating NUMERIC values */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── GET — IFA payment summary ─────────────────────────────────────────────────
export async function GET(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  // Paginate: Supabase returns max 1000 rows by default.
  // Fetch all approved commission_records across all IFAs.
  const PAGE = 1000
  let from = 0
  let allRecords: any[] = []

  while (true) {
    const { data: page, error } = await supabaseAdmin
      .from('commission_records')
      .select(`
        id, ifa_id, ifa_code, ifa_name, ifa_amount, currency,
        ifas ( id, code, name, email )
      `)
      .eq('status', 'approved')
      .eq('is_deleted', false)
      .order('ifa_id')
      .range(from, from + PAGE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!page || page.length === 0) break
    allRecords = allRecords.concat(page)
    if (page.length < PAGE) break
    from += PAGE
  }

  // Group by IFA code (denormalized string) — NOT ifa_id — so that duplicate IFA
  // records (same code, different UUIDs) are correctly consolidated into one entry.
  // countsByCurrency tracks per-currency transaction count for accurate modal display.
  const byIFA = new Map<string, {
    ifa: { id: string; code: string; name: string; email: string; advisor_notes: string | null }
    totals: Record<string, number>
    countsByCurrency: Record<string, number>
    transactionIds: string[]
  }>()

  for (const r of allRecords) {
    const joined = r.ifas
      ? (Array.isArray(r.ifas) ? r.ifas[0] : r.ifas) as { id: string; code: string; name: string; email: string }
      : null

    // Use ifa_code (denormalized) as the stable grouping key — immune to UUID mismatches
    const ifaCode: string | null = r.ifa_code ?? joined?.code ?? null
    if (!ifaCode) continue

    const existing = byIFA.get(ifaCode)
    if (!existing) {
      byIFA.set(ifaCode, {
        ifa: {
          id: r.ifa_id ?? joined?.id ?? '',   // UUID preserved for payment_batches FK
          code: ifaCode,
          name: joined?.name ?? r.ifa_name ?? '',
          email: joined?.email ?? '',
          advisor_notes: null,
        },
        totals: {} as Record<string, number>,
        countsByCurrency: {} as Record<string, number>,
        transactionIds: [] as string[],
      })
    }

    const entry = byIFA.get(ifaCode)!
    const currency = (r.currency || 'USD').toUpperCase()
    // Round each accumulation step to avoid floating-point drift
    entry.totals[currency] = round2((entry.totals[currency] ?? 0) + (r.ifa_amount ?? 0))
    entry.countsByCurrency[currency] = (entry.countsByCurrency[currency] ?? 0) + 1
    entry.transactionIds.push(r.id)
  }

  // Enrich each entry with the canonical IFA record.
  // Commission records were created pointing to auto-created temp IFAs (@temp.com).
  // We look up all IFAs by code and prefer:
  //   1. Records with user_id set (linked to an auth user — definitely canonical)
  //   2. Records with a non-temp email
  // This ensures the payments page shows real names/emails, not placeholder ones.
  const codes = [...byIFA.keys()]
  if (codes.length > 0) {
    const { data: allIFAsForCodes } = await supabaseAdmin
      .from('ifas')
      .select('id, code, name, email, user_id, advisor_notes')
      .in('code', codes)

    const bestIFA = new Map<string, { id: string; name: string; email: string; advisor_notes: string | null }>()
    for (const ifa of allIFAsForCodes ?? []) {
      const current = bestIFA.get(ifa.code)
      const isTemp = !ifa.email || ifa.email.includes('@temp.com')
      const currentIsTemp = !current || current.email.includes('@temp.com')
      // Prefer: has user_id > non-temp email > anything
      const isBetter = !current || (currentIsTemp && (!isTemp || ifa.user_id))
      if (isBetter) {
        bestIFA.set(ifa.code, { id: ifa.id, name: ifa.name ?? ifa.code, email: ifa.email ?? '', advisor_notes: ifa.advisor_notes ?? null })
      }
    }

    for (const [code, entry] of byIFA) {
      const best = bestIFA.get(code)
      if (best) {
        // Update id so payment_batches FK points to the canonical IFA
        entry.ifa.id            = best.id
        entry.ifa.name          = best.name
        entry.ifa.email         = best.email
        entry.ifa.advisor_notes = best.advisor_notes
      }
    }
  }

  const summaries = [...byIFA.values()].sort((a, b) =>
    a.ifa.name.localeCompare(b.ifa.name)
  )

  return NextResponse.json({ summaries })
}

// ── POST — process payment ────────────────────────────────────────────────────
export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const { ifa_id, payment_reference, payment_date, currency } = await request.json()

    if (!ifa_id) {
      return NextResponse.json({ error: 'ifa_id is required' }, { status: 400 })
    }

    // 0. Resolve ifa_code from the provided ifa_id.
    //    Commission records may have been created under a different UUID (duplicate IFA),
    //    so we must look up by ifa_code (denormalized) to find all matching records.
    const { data: ifaRecord, error: ifaLookupError } = await supabaseAdmin
      .from('ifas')
      .select('id, code')
      .eq('id', ifa_id)
      .maybeSingle()

    if (ifaLookupError || !ifaRecord) {
      return NextResponse.json({ error: 'IFA not found' }, { status: 400 })
    }

    // 1. Fetch all approved commission_records for this IFA (by code — handles duplicate UUIDs)
    let query = supabaseAdmin
      .from('commission_records')
      .select('id, ifa_amount, currency')
      .eq('ifa_code', ifaRecord.code)
      .eq('status', 'approved')

    if (currency) query = query.eq('currency', currency.toUpperCase())

    const { data: records, error: fetchError } = await query
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
    if (!records?.length) {
      return NextResponse.json({ error: 'No approved records found for this IFA' }, { status: 400 })
    }

    // Round total to 2dp to avoid floating-point drift
    const totalAmount = round2(records.reduce((s, r) => s + (r.ifa_amount ?? 0), 0))
    const resolvedCurrency = (currency ?? records[0].currency ?? 'USD').toUpperCase()

    // 2. Create payment_batches record
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('payment_batches')
      .insert({
        ifa_id,
        total_amount: totalAmount,
        currency: resolvedCurrency,
        payment_reference: payment_reference ?? null,
        payment_date: payment_date ?? new Date().toISOString().split('T')[0],
        transaction_count: records.length,
        status: 'paid',
        created_by: userId,
      })
      .select()
      .single()

    if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 })

    // 3. Mark each record as paid and write paid = ifa_amount so the
    //    generated `unpaid` column resolves to 0.
    //    Each record has a different ifa_amount so rows are updated individually.
    //    Batched in groups of 50 to stay within connection limits.
    //    The extra .eq('status', 'approved') guard ensures idempotency:
    //    if a record was already paid (e.g. concurrent admin), it is skipped.
    const BATCH_SIZE = 50
    let updateFailed = false
    let updateErrMsg = ''

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const slice = records.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        slice.map(r =>
          supabaseAdmin
            .from('commission_records')
            .update({ status: 'paid', paid: r.ifa_amount ?? 0, payment_batch_id: batch.id, paid_at: new Date().toISOString() })
            .eq('id', r.id)
            .eq('status', 'approved') // idempotency: skip if already paid
        )
      )
      const firstError = results.find(res => res.error)
      if (firstError?.error) {
        updateFailed = true
        updateErrMsg = firstError.error.message
        break
      }
    }

    // 4. Compensating transaction: if record updates failed, delete the batch
    //    so the UI stays consistent and the admin can retry.
    if (updateFailed) {
      await supabaseAdmin.from('payment_batches').delete().eq('id', batch.id)
      return NextResponse.json(
        { error: `Payment batch rolled back. Update error: ${updateErrMsg}` },
        { status: 500 }
      )
    }

    // 5. Audit log (best-effort)
    try {
      await supabaseAdmin.from('audit_log').insert({
        table_name: 'payment_batches',
        record_id: batch.id,
        action: 'pay',
        new_value: {
          ifa_id,
          total_amount: totalAmount,
          currency: resolvedCurrency,
          transaction_count: records.length,
          payment_reference: payment_reference ?? null,
        },
        performed_at: new Date().toISOString(),
      })
    } catch { /* audit_log may not exist yet */ }

    return NextResponse.json({
      batch,
      transactions_paid: records.length,
      total_amount: totalAmount,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
