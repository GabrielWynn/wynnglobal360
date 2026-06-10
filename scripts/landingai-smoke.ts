// scripts/landingai-smoke.ts
// Diagnostic: times the Landing.ai parse + extract calls against the real API.
// Usage:
//   npx tsx scripts/landingai-smoke.ts            → uses a tiny generated PDF
//   npx tsx scripts/landingai-smoke.ts path/to.pdf → uses a real statement PDF
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load LANDINGAI_API_KEY from .env.local without requiring dotenv
const envFile = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

import { createParseJob, getParseJob, extractFromMarkdown } from '../lib/landingai'
import { DEFAULT_EXTRACTION_SCHEMA } from '../lib/commission/extraction-schemas'

/** Builds a minimal valid single-page PDF with correct xref offsets. */
function buildTinyPdf(): Buffer {
  const stream = 'BT /F1 12 Tf 72 720 Td (Policy P-12345 Client John Doe Commission 100.00 Date 2026-01-15) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefStart = body.length
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`
  body += xref + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

async function main() {
  const pdfPath = process.argv[2]
  const buffer = pdfPath ? readFileSync(pdfPath) : buildTinyPdf()
  const name = pdfPath ? pdfPath.split(/[\\/]/).pop()! : 'tiny-smoke.pdf'
  console.log(`PDF: ${name} (${(buffer.length / 1024).toFixed(1)} KB)`)

  let t = Date.now()
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  const jobId = await createParseJob(arrayBuffer, name)
  console.log(`job submitted: ${jobId} (${((Date.now() - t) / 1000).toFixed(1)}s)`)

  let markdown = ''
  for (;;) {
    await new Promise((r) => setTimeout(r, 10_000))
    const job = await getParseJob(jobId)
    console.log(`  [${((Date.now() - t) / 1000).toFixed(0)}s] status: ${job.status}`)
    if (job.status === 'failed') throw new Error(`parse job failed: ${job.error}`)
    if (job.status === 'completed' && job.markdown) {
      markdown = job.markdown
      break
    }
    if (Date.now() - t > 20 * 60_000) throw new Error('parse job timed out after 20 minutes')
  }
  console.log(`parse:   ${((Date.now() - t) / 1000).toFixed(1)}s — markdown ${markdown.length} chars`)

  t = Date.now()
  const { extraction, partial, schemaViolations } = await extractFromMarkdown(markdown, DEFAULT_EXTRACTION_SCHEMA)
  console.log(`extract: ${((Date.now() - t) / 1000).toFixed(1)}s — partial=${partial}`)
  const rows = (extraction as { rows?: unknown[] }).rows
  console.log(`rows: ${Array.isArray(rows) ? rows.length : 0}`)
  if (schemaViolations.length) console.log('violations:', schemaViolations.slice(0, 3))
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err instanceof Error ? `${err.name}: ${err.message}` : err)
  process.exit(1)
})
