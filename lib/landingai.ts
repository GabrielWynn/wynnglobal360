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

/** Parse model — overridable via env (e.g. 'dpt-2-mini' for faster parsing). */
const PARSE_MODEL = process.env.LANDINGAI_PARSE_MODEL || 'dpt-2-latest'
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
 * Parse a PDF into Markdown via ADE Parse (synchronous).
 * NOTE: real statements regularly exceed serverless time limits — prefer the
 * async Parse Jobs flow (createParseJob + getParseJob) in API routes.
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

// ---------------------------------------------------------------------------
// Parse Jobs (asynchronous) — submit, then poll until completed.
// Docs: https://docs.landing.ai/ade/ade-parse-async
// ---------------------------------------------------------------------------

/** Submit a PDF for async parsing. Returns the Landing.ai job id immediately. */
export async function createParseJob(buffer: ArrayBuffer, filename: string): Promise<string> {
  const form = new FormData()
  form.append('document', new Blob([buffer], { type: 'application/pdf' }), filename)
  form.append('model', PARSE_MODEL)

  const res = await fetch(`${ADE_BASE_URL}/parse/jobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getApiKey()}` },
    body: form,
  })

  if (!res.ok) {
    throw new LandingAIError(
      `Landing.ai parse job submission failed (${res.status}): ${await readErrorDetail(res)}`,
      res.status
    )
  }

  const data = await res.json()
  if (typeof data?.job_id !== 'string' || !data.job_id) {
    throw new LandingAIError('Landing.ai did not return a job_id for the parse job', 502)
  }
  return data.job_id
}

export interface ParseJobStatus {
  /** 'completed' | 'failed' | anything else = still processing */
  status: string
  /** Present only when status === 'completed'. */
  markdown?: string
  /** Failure detail when status === 'failed'. */
  error?: string
}

/**
 * Poll a parse job. When completed, the Markdown comes either inline
 * (`data.markdown`) or via a presigned `output_url` (payloads > 1 MB).
 */
export async function getParseJob(jobId: string): Promise<ParseJobStatus> {
  const res = await fetch(`${ADE_BASE_URL}/parse/jobs/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  })

  if (!res.ok) {
    throw new LandingAIError(`Landing.ai parse job status failed (${res.status}): ${await readErrorDetail(res)}`, res.status)
  }

  const data = await res.json()
  const status = typeof data?.status === 'string' ? data.status : 'unknown'

  if (status === 'failed') {
    const detail = data?.error || data?.detail || 'Landing.ai reported the parse job as failed'
    return { status, error: typeof detail === 'string' ? detail : JSON.stringify(detail) }
  }

  if (status !== 'completed') return { status }

  // Completed — markdown inline or behind a presigned URL
  let markdown: string | undefined =
    typeof data?.data?.markdown === 'string' ? data.data.markdown : undefined

  if (!markdown && typeof data?.output_url === 'string' && data.output_url) {
    const out = await fetch(data.output_url)
    if (!out.ok) {
      throw new LandingAIError(`Failed to download parse output (${out.status})`, 502)
    }
    // output_url returns a JSON document containing the markdown
    const body = await out.text()
    try {
      const parsed = JSON.parse(body)
      markdown = typeof parsed?.markdown === 'string' ? parsed.markdown : typeof parsed?.data?.markdown === 'string' ? parsed.data.markdown : undefined
    } catch {
      markdown = body // some outputs are raw markdown
    }
  }

  if (!markdown || !markdown.trim()) {
    throw new LandingAIError('Landing.ai parse job completed but returned no Markdown content', 502)
  }
  return { status, markdown }
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
