// app/api/commission/extract-pdf/route.ts
// Converts a platform commission statement PDF into structured canonical rows
// via Landing.ai ADE (parse → extract). READ-ONLY: nothing is persisted here —
// the client previews the rows and submits them through the existing
// /api/commission/process-upload pipeline (with an identity column mapping,
// since extraction already emits canonical field names).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'
import { parsePdf, extractFromMarkdown, LandingAIError } from '@/lib/landingai'
import { getExtractionSchema } from '@/lib/commission/extraction-schemas'
import { normalizeExtractedRow, type RowWarning } from '@/lib/commission/normalize'

// Multi-page parse + extract can take minutes — needs Vercel fluid compute.
export const maxDuration = 300
export const runtime = 'nodejs'

const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB

export interface ExtractPdfResponse {
  rows: Record<string, string>[]
  /** Per-row validation warnings (0-based index into rows). */
  row_warnings: RowWarning[]
  /** Document-level warnings, e.g. HTTP 206 partial schema conformance details. */
  warnings: string[]
  partial: boolean
}

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const form = await request.formData()
    const platformId = form.get('platform_id')
    const file = form.get('file')

    if (typeof platformId !== 'string' || !platformId) {
      return NextResponse.json({ error: 'platform_id is required' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 })
    }
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (!isPdf) {
      return NextResponse.json({ error: 'Only PDF files are accepted on this endpoint' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max is 20 MB` },
        { status: 400 }
      )
    }

    // ── Resolve platform → extraction schema ─────────────────────────────
    const { data: platform, error: platformError } = await supabaseAdmin
      .from('platforms')
      .select('id, code, name')
      .eq('id', platformId)
      .maybeSingle()

    if (platformError || !platform) {
      return NextResponse.json({ error: 'Unknown platform' }, { status: 400 })
    }

    const schema = getExtractionSchema(platform.code)

    // ── Landing.ai: parse (PDF → Markdown) then extract (Markdown → JSON) ─
    const markdown = await parsePdf(await file.arrayBuffer(), file.name)
    const { extraction, partial, schemaViolations } = await extractFromMarkdown(markdown, schema)

    const rawRows = Array.isArray((extraction as { rows?: unknown }).rows)
      ? ((extraction as { rows: unknown[] }).rows as Record<string, unknown>[])
      : []

    if (!rawRows.length) {
      return NextResponse.json(
        {
          error:
            'No commission rows could be extracted from this PDF. ' +
            'Check that the file is a commission statement for the selected platform.' +
            (schemaViolations.length ? ` Details: ${schemaViolations.join('; ')}` : ''),
        },
        { status: 422 }
      )
    }

    // ── Normalise + validate rows (values coerced to strings for the CSV pipeline) ─
    const rows: Record<string, string>[] = []
    const rowWarnings: RowWarning[] = []
    rawRows.forEach((raw, i) => {
      const { row, warnings } = normalizeExtractedRow(raw, i)
      rows.push(row)
      rowWarnings.push(...warnings)
    })

    const warnings: string[] = []
    if (partial) {
      warnings.push(
        'Landing.ai reported partial schema conformance — review the extracted rows carefully before processing.'
      )
      warnings.push(...schemaViolations)
    }

    const response: ExtractPdfResponse = { rows, row_warnings: rowWarnings, warnings, partial }
    return NextResponse.json(response)
  } catch (err: unknown) {
    if (err instanceof LandingAIError) {
      // Upstream failure — nothing was persisted; safe for the user to retry.
      const status = err.status >= 400 && err.status < 500 ? 422 : 502
      return NextResponse.json({ error: err.message }, { status })
    }
    const message = err instanceof Error ? err.message : 'PDF extraction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
