// lib/landingai.ts
// Server-side client for Landing.ai Agentic Document Extraction (ADE).
// Two-step pipeline:
//   1. parsePdf(buffer)              → PDF parsed to Markdown   (POST /v1/ade/parse)
//   2. extractFromMarkdown(md, sch)  → Markdown + JSON schema → structured JSON
//                                                              (POST /v1/ade/extract)
// Plain fetch + multipart is used instead of the `landingai-ade` SDK to avoid
// Next.js bundling issues — the API surface we need is two endpoints.
// Docs: https://docs.landing.ai/ade/ade-separate-apis
//
// SERVER-ONLY: relies on LANDINGAI_API_KEY. Never import from client components.

const ADE_BASE_URL = process.env.LANDINGAI_BASE_URL || 'https://api.va.landing.ai/v1/ade'

/** Latest stable parse model (Document Pre-trained Transformer v2). */
const PARSE_MODEL = 'dpt-2-latest'
/** Latest stable extraction model. */
const EXTRACT_MODEL = 'extract-latest'

export class LandingAIError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'LandingAIError'
    this.status = status
  }
}

function getApiKey(): string {
  const key = process.env.LANDINGAI_API_KEY
  if (!key) {
    throw new LandingAIError(
      'LANDINGAI_API_KEY is not configured — add it to the environment (see .env.example)',
      500
    )
  }
  return key
}

/** Read an error body defensively (Landing.ai returns JSON, but never assume). */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json()
    return body?.detail || body?.message || body?.error || JSON.stringify(body).slice(0, 500)
  } catch {
    return res.statusText
  }
}

/**
 * Parse a PDF into Markdown via ADE Parse.
 * Multi-page statements can take minutes — callers must run in a route with a
 * generous `maxDuration`.
 */
export async function parsePdf(buffer: ArrayBuffer, filename: string): Promise<string> {
  const form = new FormData()
  form.append('document', new Blob([buffer], { type: 'application/pdf' }), filename)
  form.append('model', PARSE_MODEL)

  const res = await fetch(`${ADE_BASE_URL}/parse`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getApiKey()}` },
    body: form,
  })

  if (!res.ok) {
    throw new LandingAIError(`Landing.ai parse failed (${res.status}): ${await readErrorDetail(res)}`, res.status)
  }

  const data = await res.json()
  if (typeof data?.markdown !== 'string' || !data.markdown.trim()) {
    throw new LandingAIError('Landing.ai parse returned no Markdown content for this document', 502)
  }
  return data.markdown
}

export interface ExtractResult {
  /** Extracted data conforming (fully or partially) to the supplied schema. */
  extraction: Record<string, unknown>
  /** True when the API returned HTTP 206 (partial schema conformance). */
  partial: boolean
  /** Violation details reported by the API on 206 responses — never silently dropped. */
  schemaViolations: string[]
}

/**
 * Extract structured JSON from parsed Markdown using a JSON schema.
 * HTTP 206 means the extraction only partially conformed to the schema:
 * we still return the rows but surface the violation details as warnings.
 */
export async function extractFromMarkdown(
  markdown: string,
  schema: Record<string, unknown>
): Promise<ExtractResult> {
  const form = new FormData()
  form.append('schema', JSON.stringify(schema))
  form.append('markdown', new Blob([markdown], { type: 'text/markdown' }), 'document.md')
  form.append('model', EXTRACT_MODEL)

  const res = await fetch(`${ADE_BASE_URL}/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getApiKey()}` },
    body: form,
  })

  // 206 Partial Content = extraction succeeded but did not fully conform to the schema
  if (!res.ok && res.status !== 206) {
    throw new LandingAIError(`Landing.ai extract failed (${res.status}): ${await readErrorDetail(res)}`, res.status)
  }

  const data = await res.json()
  const extraction = (data?.extraction ?? {}) as Record<string, unknown>

  const schemaViolations: string[] = []
  if (res.status === 206) {
    const violation = data?.schema_violation_error ?? data?.detail
    if (violation) {
      if (Array.isArray(violation)) {
        schemaViolations.push(...violation.map((v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))))
      } else {
        schemaViolations.push(typeof violation === 'string' ? violation : JSON.stringify(violation))
      }
    } else {
      schemaViolations.push('Extraction only partially conformed to the schema (no details returned)')
    }
  }

  return { extraction, partial: res.status === 206, schemaViolations }
}
