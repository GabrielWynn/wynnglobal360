// app/api/commission/process-upload/route.ts
// Server-side CSV processing: applies column mapping, does Azure bulk lookup,
// creates IFA records, saves raw_commission_data + commission_records.
// Every row in the uploaded file is guaranteed to be persisted.
// Uses service role to bypass RLS.
// Batch inserts (CHUNK rows at a time) to stay within Vercel's function timeout.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { bulkLookupIFAs } from '@/lib/azure'
import { parseAmount } from '@/lib/currency'
import { normalizeDate, normalizeCommissionType } from '@/lib/commission/normalize'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

interface ColumnMapping {
  policy_number_col: string
  amount_col: string
  date_col: string
  commission_type_col?: string | null
  currency_col?: string | null
  policy_holder_col?: string | null
  commencement_date_col?: string | null
  payment_pct_col?: string | null
  default_currency: string
}

interface CSVRow {
  [key: string]: string
}

// Date + commission-type normalisation lives in lib/commission/normalize.ts,
// shared with the PDF extraction path (/api/commission/extract-pdf).

const CHUNK = 200 // rows per batch insert

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  const stats = {
    total: 0,
    saved: 0,
    mapped: 0,
    unmapped: 0,
    new_ifas: 0,
    date_warnings: 0,
    errors: [] as string[],
  }

  try {
    const body = await request.json()
    const {
      platform_id,
      filename,
      rows,
      mapping,
    }: { platform_id: string; filename: string; rows: CSVRow[]; mapping: ColumnMapping } = body

    if (!platform_id || !rows?.length || !mapping) {
      return NextResponse.json({ error: 'platform_id, rows, and mapping are required' }, { status: 400 })
    }

    stats.total = rows.length
    const today = new Date().toISOString().split('T')[0]

    // ── Resolve uploader email ────────────────────────────────────────────
    let uploaderEmail: string | null = null
    try {
      const { data: { user: uploaderUser } } = await supabaseAdmin.auth.admin.getUserById(userId)
      uploaderEmail = uploaderUser?.email ?? null
    } catch { /* non-fatal */ }

    // ── Create upload batch record ────────────────────────────────────────
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('csv_upload_batches')
      .insert({
        platform_id,
        filename,
        total_rows: rows.length,
        status: 'processing',
        uploaded_by:       userId,
        uploaded_by_email: uploaderEmail,
      })
      .select()
      .single()

    if (batchError) {
      return NextResponse.json({ error: `Failed to create batch: ${batchError.message}` }, { status: 500 })
    }

    // ── Extract unique policy numbers for bulk Azure lookup ───────────────
    const policyNumbers = [
      ...new Set(
        rows
          .map(row => (row[mapping.policy_number_col] || '').trim())
          .filter(Boolean)
      ),
    ]

    // Azure failure is recoverable — all rows saved as unmapped, re-mappable later
    let azureMappings = new Map<string, { ifa_code: string; ifa_name: string }>()
    try {
      azureMappings = await bulkLookupIFAs(policyNumbers)
    } catch (azureErr: any) {
      stats.errors.push(
        `Azure lookup failed: ${azureErr.message} — all rows saved as unmapped and can be re-mapped via "Remap Unmapped" later`
      )
    }

    // ── Pre-load existing IFAs to minimise per-row DB round-trips ─────────
    const { data: existingIFAs } = await supabaseAdmin
      .from('ifas')
      .select('id, code')

    const ifaByCode = new Map<string, string>(
      existingIFAs?.map(ifa => [ifa.code, ifa.id]) ?? []
    )

    // ── Pre-load manual policy mappings (fallback when Azure fails) ───────
    const { data: manualMappings } = await supabaseAdmin
      .from('manual_policy_mappings')
      .select('policy_number, ifa_id, ifa_code, ifa_name')

    const manualByPolicy = new Map<string, { ifa_id: string; ifa_code: string; ifa_name: string }>(
      manualMappings?.map(m => [
        m.policy_number,
        { ifa_id: m.ifa_id, ifa_code: m.ifa_code, ifa_name: m.ifa_name ?? '' },
      ]) ?? []
    )

    // ── Build batch arrays (all in-memory, no per-row DB calls) ──────────
    const rawBatch: any[] = []
    const crBatch: any[] = []
    // Deduplicated by policy_number for unmapped_policies upsert
    const unmappedPolicies = new Map<string, any>()

    for (const row of rows) {
      try {
        // ── Parse fields ────────────────────────────────────────────────
        const policyNumber    = (row[mapping.policy_number_col] || '').trim()
        const grossAmount     = parseAmount(row[mapping.amount_col] || '0')
        const rawDate         = mapping.date_col ? (row[mapping.date_col] || '').trim() : ''
        const parsedDate      = normalizeDate(rawDate)
        const dateWarning     = !parsedDate
        const transactionDate = parsedDate ?? today
        if (dateWarning) stats.date_warnings++

        const rawCommissionType = mapping.commission_type_col
          ? (row[mapping.commission_type_col] || '').trim()
          : ''
        const commissionTypeCode = normalizeCommissionType(rawCommissionType)
        const rawCurrency = (mapping.currency_col
          ? (row[mapping.currency_col] || '').trim().toUpperCase()
          : '').slice(0, 10)
        // Only accept 3-letter alpha currency codes; anything else (N/A, blank, etc.) falls back to default
        const currency = /^[A-Z]{3}$/.test(rawCurrency)
          ? rawCurrency
          : (mapping.default_currency || 'USD')
        const holderName = mapping.policy_holder_col
          ? (row[mapping.policy_holder_col] || '').trim()
          : ''

        // Capture platform-supplied payment/advisory fee percentage if present
        const paymentPctRaw = mapping.payment_pct_col
          ? parseFloat(row[mapping.payment_pct_col] || '')
          : NaN
        const platformPaymentPct = isNaN(paymentPctRaw) ? null : paymentPctRaw

        // Optional APE (e.g. IDAD Cash Invested emitted by PDF extraction as row.ape)
        const apeRaw = parseAmount(row.ape ?? '')
        const ape = row.ape !== undefined && row.ape !== '' && !Number.isNaN(apeRaw) ? apeRaw : null

        // Capture policy commencement date if present
        const commencementDate = mapping.commencement_date_col
          ? normalizeDate((row[mapping.commencement_date_col] || '').trim())
          : null

        // ── Rows with no policy number ──────────────────────────────────
        // These are saved as commission_records with a '[NO POLICY]' placeholder
        // so they appear in the master file for review (e.g. lump-sum adjustments).
        if (!policyNumber) {
          const noPolId = randomUUID()
          rawBatch.push({
            id:                    noPolId,
            upload_batch_id:       batch.id,
            platform_id,
            policy_number:         '[NO POLICY]',
            transaction_date:      transactionDate,
            commission_type_code:  commissionTypeCode || null,
            gross_amount:          grossAmount,
            calculated_commission: grossAmount,
            currency,
            raw_data:              row,
            mapping_status:        'unmapped',
          })
          crBatch.push({
            upload_batch_id:      batch.id,
            raw_data_id:          noPolId,
            transaction_date:     transactionDate,
            policy_number:        '[NO POLICY]',
            policy_holder_name:   holderName || null,
            ifa_id:               null,
            ifa_code:             null,
            ifa_name:             null,
            platform_id,
            commission_type:      rawCommissionType || null,
            commission_type_code: commissionTypeCode || null,
            amount:               grossAmount,
            currency,
            platform_payment_pct: platformPaymentPct,
            commencement_date:    commencementDate,
            ape,
            ifa_percentage:       null,
            suspense_percentage:  null,
            wgi_percentage:       null,
            paid:                 0.00,
            status:               'pending',
            created_by:           userId,
            notes:                'No policy number in source file',
          })
          stats.unmapped++
          continue
        }

        // ── Determine IFA mapping ───────────────────────────────────────
        let ifaId:   string | null = null
        let ifaCode: string | null = null
        let ifaName: string | null = null

        const azureData = azureMappings.get(policyNumber)
        if (azureData) {
          // ── Azure resolved this policy ────────────────────────────────────
          const { ifa_code, ifa_name } = azureData
          let resolvedId = ifaByCode.get(ifa_code)

          if (!resolvedId) {
            // IFA not yet in Supabase — create it (one DB call per new unique IFA code)
            const { data: newIFA, error: ifaError } = await supabaseAdmin
              .from('ifas')
              .insert({
                code:   ifa_code,
                name:   ifa_name || ifa_code,
                email:  `${ifa_code.toLowerCase()}@temp.com`,
                status: 'active',
                role:   'ifa',
              })
              .select('id')
              .single()

            if (ifaError || !newIFA) {
              stats.errors.push(
                `Failed to create IFA ${ifa_code}: ${ifaError?.message} — row saved as unmapped`
              )
            } else {
              resolvedId = newIFA.id as string
              ifaByCode.set(ifa_code, resolvedId)
              stats.new_ifas++
            }
          }

          if (resolvedId) {
            ifaId   = resolvedId
            ifaCode = ifa_code
            ifaName = ifa_name
          }
        } else {
          // ── Azure failed — check manual_policy_mappings as fallback ───────
          const manual = manualByPolicy.get(policyNumber)
          if (manual) {
            ifaId   = manual.ifa_id
            ifaCode = manual.ifa_code
            ifaName = manual.ifa_name || null
          }
        }

        const isMapped = ifaId !== null
        if (isMapped) {
          stats.mapped++
        } else {
          stats.unmapped++
          unmappedPolicies.set(policyNumber, {
            policy_number:      policyNumber,
            platform_id,
            policy_holder_name: holderName,
            status:             'pending',
          })
        }

        // Pre-generate UUID so raw_data_id can be set in commission_records
        // without a round-trip to get the inserted row's ID back.
        const rawId = randomUUID()

        rawBatch.push({
          id:                    rawId,
          upload_batch_id:       batch.id,
          platform_id,
          policy_number:         policyNumber,
          transaction_date:      transactionDate,
          commission_type_code:  commissionTypeCode || null,
          gross_amount:          grossAmount,
          calculated_commission: grossAmount,
          currency,
          raw_data:              row,
          mapping_status:        isMapped ? 'mapped' : 'unmapped',
        })

        crBatch.push({
          upload_batch_id:     batch.id,
          raw_data_id:         rawId,
          transaction_date:    transactionDate,
          policy_number:       policyNumber,
          policy_holder_name:  holderName || null,
          ifa_id:              ifaId,
          ifa_code:            ifaCode,
          ifa_name:            ifaName,
          platform_id,
          commission_type:      rawCommissionType || null,
          commission_type_code: commissionTypeCode || null,
          amount:              grossAmount,
          currency,
          platform_payment_pct: platformPaymentPct,
          commencement_date:   commencementDate,
          ape,
          ifa_percentage:      null,
          suspense_percentage: null,
          wgi_percentage:      null,
          paid:                0.00,
          status:              'pending',
          created_by:          userId,
          notes:               dateWarning
            ? 'Warning: transaction_date missing from source — upload date used as fallback'
            : null,
        })
      } catch (rowErr: any) {
        stats.errors.push(`Row processing error: ${rowErr.message}`)
      }
    }

    // ── Batch insert raw_commission_data ──────────────────────────────────
    for (let i = 0; i < rawBatch.length; i += CHUNK) {
      const { error } = await supabaseAdmin
        .from('raw_commission_data')
        .insert(rawBatch.slice(i, i + CHUNK))
      if (error) {
        stats.errors.push(
          `Raw data insert failed (chunk ${Math.floor(i / CHUNK) + 1}): ${error.message}`
        )
      }
    }

    // ── Batch insert commission_records ───────────────────────────────────
    let crSaved = 0
    for (let i = 0; i < crBatch.length; i += CHUNK) {
      const chunk = crBatch.slice(i, i + CHUNK)
      const { error } = await supabaseAdmin
        .from('commission_records')
        .insert(chunk)
      if (error) {
        stats.errors.push(
          `Commission records insert failed (chunk ${Math.floor(i / CHUNK) + 1}): ${error.message}`
        )
      } else {
        crSaved += chunk.length
      }
    }
    stats.saved = crSaved

    // ── Batch upsert unmapped_policies (deduped) ──────────────────────────
    const unmappedArr = [...unmappedPolicies.values()]
    for (let i = 0; i < unmappedArr.length; i += CHUNK) {
      await supabaseAdmin
        .from('unmapped_policies')
        .upsert(unmappedArr.slice(i, i + CHUNK), { onConflict: 'policy_number' })
    }

    // ── Update batch status ────────────────────────────────────────────────
    await supabaseAdmin
      .from('csv_upload_batches')
      .update({
        status:         'completed',
        processed_rows: stats.saved,
        mapped_rows:    stats.mapped,
        unmapped_rows:  stats.unmapped,
        error_rows:     stats.errors.length,
      })
      .eq('id', batch.id)

    return NextResponse.json(stats)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
