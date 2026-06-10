'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthHeaders } from '@/lib/supabase'
import { SUPPORTED_CURRENCIES } from '@/lib/currency'
import Papa from 'papaparse'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Platform {
  id: string
  code: string
  name: string
}

interface ColumnMapping {
  id?: string
  platform_id: string
  policy_number_col: string
  amount_col: string
  date_col: string
  commission_type_col: string
  currency_col: string
  policy_holder_col: string
  commencement_date_col: string
  payment_pct_col: string
  default_currency: string
}

interface CSVRow {
  [key: string]: string
}

interface RowWarning {
  row: number
  field: string
  message: string
  severity: 'error' | 'warning'
}

interface ProcessingResult {
  total: number
  saved: number
  mapped: number
  unmapped: number
  new_ifas: number
  errors: string[]
}

type Step = 'select' | 'map' | 'preview' | 'processing' | 'done'

const EMPTY_MAPPING: Omit<ColumnMapping, 'platform_id' | 'id'> = {
  policy_number_col: '',
  amount_col: '',
  date_col: '',
  commission_type_col: '',
  currency_col: '',
  policy_holder_col: '',
  commencement_date_col: '',
  payment_pct_col: '',
  default_currency: 'USD',
}

// PDF extraction emits canonical field names, so the mapping step is skipped
// and this identity mapping is passed straight to process-upload.
const PDF_IDENTITY_MAPPING: Omit<ColumnMapping, 'platform_id' | 'id'> = {
  policy_number_col: 'policy_number',
  amount_col: 'amount',
  date_col: 'transaction_date',
  commission_type_col: 'commission_type',
  currency_col: 'currency',
  policy_holder_col: 'policy_holder_name',
  commencement_date_col: 'commencement_date',
  payment_pct_col: '',
  default_currency: 'USD',
}

const RESULT_CARD_STYLES: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  green: { bg: 'bg-green-50', text: 'text-green-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-600' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  red: { bg: 'bg-red-50', text: 'text-red-600' },
  gray: { bg: 'bg-gray-50', text: 'text-gray-600' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter()

  const [authChecked] = useState(true)

  // Platform
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [selectedPlatformId, setSelectedPlatformId] = useState('')

  // File / CSV
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<CSVRow[]>([])
  const [allRows, setAllRows] = useState<CSVRow[]>([])
  const [parsing, setParsing] = useState(false)

  // PDF extraction (Landing.ai)
  const isPdf = !!file && /\.pdf$/i.test(file.name)
  const [extracting, setExtracting] = useState(false)
  const [extractWarnings, setExtractWarnings] = useState<string[]>([])
  const [rowWarnings, setRowWarnings] = useState<RowWarning[]>([])
  const [excludeInvalid, setExcludeInvalid] = useState(true)

  // Mapping
  const [savedMapping, setSavedMapping] = useState<ColumnMapping | null>(null)
  const [mapping, setMapping] = useState<Omit<ColumnMapping, 'platform_id' | 'id'>>({ ...EMPTY_MAPPING })
  const [saveMapping, setSaveMapping] = useState(true)

  // Flow
  const [step, setStep] = useState<Step>('select')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<ProcessingResult | null>(null)
  const [error, setError] = useState('')

  // ── Load platforms ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authChecked) return
    getAuthHeaders().then(headers =>
      fetch('/api/commission/platforms', { headers })
        .then(r => r.json())
        .then(({ platforms }) => { if (platforms) setPlatforms(platforms) })
    )
  }, [authChecked])

  // ── When platform changes, fetch saved mapping ──────────────────────────────
  useEffect(() => {
    if (!selectedPlatformId) {
      setSavedMapping(null)
      return
    }
    getAuthHeaders().then(authHeaders =>
      fetch(`/api/commission/platform-mappings?platform_id=${selectedPlatformId}`, { headers: authHeaders })
        .then(r => r.json())
        .then(({ mapping: m }) => setSavedMapping(m ?? null))
    )
  }, [selectedPlatformId])

  // ── File helpers ────────────────────────────────────────────────────────────
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) selectFile(e.dataTransfer.files[0])
  }

  const selectFile = (f: File) => {
    if (!f.name.match(/\.(csv|pdf)$/i)) { setError('Please upload a CSV or PDF file'); return }
    setFile(f)
    setError('')
    setHeaders([])
    setPreviewRows([])
    setAllRows([])
    setExtractWarnings([])
    setRowWarnings([])
    setExcludeInvalid(true)
    setStep('select')
  }

  // ── Extract PDF via Landing.ai (server-side, async parse job) ──────────────
  // POST submits the parse job, then we poll GET until parsing + extraction
  // complete. Long statements can take several minutes — each poll request is
  // short, so Vercel function timeouts no longer apply to the parse itself.
  interface ExtractPollResponse {
    status?: string
    rows?: CSVRow[]
    warnings?: string[]
    row_warnings?: RowWarning[]
    error?: string
  }

  /** Vercel timeouts / platform errors return plain text, not JSON — never assume. */
  const parseJsonResponse = async (res: Response): Promise<ExtractPollResponse> => {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(
        res.status === 504 || /timeout/i.test(text)
          ? 'The server timed out — please retry.'
          : `PDF extraction failed (HTTP ${res.status}): ${text.slice(0, 200)}`
      )
    }
  }

  const EXTRACT_POLL_MS = 10_000
  const EXTRACT_MAX_WAIT_MS = 20 * 60_000 // give up after 20 minutes

  const extractPdfAndContinue = async () => {
    if (!file || !selectedPlatformId) return
    setExtracting(true)
    setError('')

    try {
      const authHeaders = await getAuthHeaders()
      const form = new FormData()
      form.append('platform_id', selectedPlatformId)
      form.append('file', file)

      // 1) Submit the parse job
      const submitRes = await fetch('/api/commission/extract-pdf', {
        method: 'POST',
        headers: authHeaders, // no Content-Type — browser sets the multipart boundary
        body: form,
      })
      const submitData = (await parseJsonResponse(submitRes)) as ExtractPollResponse & { job_id?: string }
      if (!submitRes.ok) throw new Error(submitData.error || 'PDF extraction failed')
      if (!submitData.job_id) throw new Error('Server did not return a parse job id')

      // 2) Poll until completed (or failure / timeout)
      const deadline = Date.now() + EXTRACT_MAX_WAIT_MS
      let data: ExtractPollResponse
      for (;;) {
        await new Promise(r => setTimeout(r, EXTRACT_POLL_MS))
        if (Date.now() > deadline) {
          throw new Error('PDF extraction is taking too long — please try again later.')
        }

        const pollHeaders = await getAuthHeaders() // refresh token on long waits
        const pollRes = await fetch(
          `/api/commission/extract-pdf?job_id=${encodeURIComponent(submitData.job_id)}&platform_id=${encodeURIComponent(selectedPlatformId)}`,
          { headers: pollHeaders }
        )
        data = await parseJsonResponse(pollRes)
        if (!pollRes.ok) throw new Error(data.error || 'PDF extraction failed')
        if (data.status === 'completed') break
        // any other status → still parsing, poll again
      }

      const rows: CSVRow[] = data.rows ?? []
      setHeaders(Object.keys(rows[0] ?? {}))
      setAllRows(rows)
      setPreviewRows(rows.slice(0, 5))
      setExtractWarnings(data.warnings ?? [])
      setRowWarnings(data.row_warnings ?? [])
      setMapping({ ...PDF_IDENTITY_MAPPING })
      setStep('preview') // mapping step skipped — keys are already canonical
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'PDF extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  // 0-based indexes of rows with a failed REQUIRED field (severity 'error')
  const invalidRowIdx = new Set(rowWarnings.filter(w => w.severity === 'error').map(w => w.row))
  const rowsToSubmit = isPdf && excludeInvalid
    ? allRows.filter((_, i) => !invalidRowIdx.has(i))
    : allRows

  // ── Download extracted rows as CSV (audit + manual-correction fallback) ────
  const downloadCsv = () => {
    const csv = Papa.unparse(allRows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const base = (file?.name ?? 'statement').replace(/\.pdf$/i, '')
    const date = new Date().toISOString().split('T')[0]
    a.href = url
    a.download = `${selectedPlatform?.code ?? 'platform'}-${base}-${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Parse CSV ───────────────────────────────────────────────────────────────
  const parseAndContinue = () => {
    if (!file || !selectedPlatformId) {
      setError('Please select a platform and a file')
      return
    }
    if (isPdf) {
      extractPdfAndContinue()
      return
    }
    setParsing(true)
    setError('')

    Papa.parse(file as unknown as Papa.LocalFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<CSVRow>) => {
        setParsing(false)
        if (results.errors.length > 0) {
          setError(`CSV parse error: ${results.errors[0].message}`)
          return
        }
        const data = results.data as CSVRow[]
        if (!data.length) { setError('CSV file is empty'); return }

        const cols = Object.keys(data[0])
        setHeaders(cols)
        setAllRows(data)
        setPreviewRows(data.slice(0, 5))

        if (savedMapping) {
          // Auto-apply saved mapping and go straight to preview
          setMapping({
            policy_number_col: savedMapping.policy_number_col,
            amount_col: savedMapping.amount_col,
            date_col: savedMapping.date_col,
            commission_type_col: savedMapping.commission_type_col ?? '',
            currency_col: savedMapping.currency_col ?? '',
            policy_holder_col: savedMapping.policy_holder_col ?? '',
            commencement_date_col: savedMapping.commencement_date_col ?? '',
            payment_pct_col: savedMapping.payment_pct_col ?? '',
            default_currency: savedMapping.default_currency ?? 'USD',
          })
          setStep('preview')
        } else {
          setMapping({ ...EMPTY_MAPPING })
          setStep('map')
        }
      },
      error: (err: Error) => {
        setParsing(false)
        setError(`Failed to parse CSV: ${err.message}`)
      },
    })
  }

  // ── Save mapping and proceed ────────────────────────────────────────────────
  const confirmMapping = async () => {
    if (!mapping.policy_number_col || !mapping.amount_col || !mapping.date_col) {
      setError('Policy Number, Amount, and Date columns are required')
      return
    }
    setError('')

    if (saveMapping) {
      const payload = { platform_id: selectedPlatformId, ...mapping }
      const authHeaders = await getAuthHeaders()
      if (savedMapping?.id) {
        await fetch(`/api/commission/platform-mappings/${savedMapping.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(payload),
        })
      } else {
        const res = await fetch('/api/commission/platform-mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(payload),
        })
        const { mapping: saved } = await res.json()
        if (saved) setSavedMapping(saved)
      }
    }

    setStep('preview')
  }

  // ── Process upload ──────────────────────────────────────────────────────────
  const processUpload = async () => {
    setProcessing(true)
    setStep('processing')
    setError('')

    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/commission/process-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          platform_id: selectedPlatformId,
          filename: file?.name || 'upload.csv',
          rows: rowsToSubmit,
          mapping,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Processing failed')
      setResult(data)
      setStep('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Processing failed')
      setStep('preview')
    } finally {
      setProcessing(false)
    }
  }

  // ── Reset ───────────────────────────────────────────────────────────────────
  const reset = () => {
    setFile(null)
    setHeaders([])
    setPreviewRows([])
    setAllRows([])
    setResult(null)
    setError('')
    setStep('select')
    setMapping({ ...EMPTY_MAPPING })
    setExtractWarnings([])
    setRowWarnings([])
    setExcludeInvalid(true)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const selectedPlatform = platforms.find(p => p.id === selectedPlatformId)

  const ColSelect = ({
    label,
    field,
    required = false,
  }: {
    label: string
    field: keyof typeof mapping
    required?: boolean
  }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        value={mapping[field] as string}
        onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value }))}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— not mapped —</option>
        {headers.map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  )

  if (!authChecked) return null

  // ── Step labels ─────────────────────────────────────────────────────────────
  const steps = [
    { key: 'select', label: 'Select' },
    { key: 'map', label: 'Map Columns' },
    { key: 'preview', label: 'Preview' },
    { key: 'done', label: 'Done' },
  ]
  const currentStepIdx = steps.findIndex(s => s.key === step || (step === 'processing' && s.key === 'preview'))

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        <button
          onClick={() => router.push('/commission/admin')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors"
        >
          ← Back to Admin
        </button>

        {/* Step indicator */}
        {step !== 'done' && (
          <div className="flex items-center gap-2">
            {steps.filter(s => !(s.key === 'map' && (savedMapping || isPdf))).map((s, i, arr) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 ${i <= currentStepIdx ? 'text-blue-600' : 'text-gray-400'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${i <= currentStepIdx ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'}`}>
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium">{s.label}</span>
                </div>
                {i < arr.length - 1 && <div className="h-px w-8 bg-gray-300" />}
              </div>
            ))}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {/* ── STEP: SELECT ─────────────────────────────────────────────────── */}
        {step === 'select' && (
          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            {/* Platform selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Platform <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedPlatformId}
                onChange={e => setSelectedPlatformId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select platform —</option>
                {platforms.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
              {selectedPlatformId && (
                <p className="mt-1 text-xs text-gray-500">
                  {savedMapping
                    ? '✓ Saved column mapping found — will be auto-applied'
                    : 'No saved mapping — you will be prompted to map columns after upload'}
                </p>
              )}
            </div>

            {/* File drop */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CSV or PDF File <span className="text-red-500">*</span>
              </label>
              <div
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('csv-input')?.click()}
              >
                <svg className="mx-auto h-10 w-10 text-gray-400 mb-3" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-sm text-gray-600">
                  {file ? file.name : 'Drop CSV or PDF here or click to browse'}
                </p>
                {file && (
                  <p className="text-xs text-gray-400 mt-1">({(file.size / 1024).toFixed(1)} KB)</p>
                )}
                <input id="csv-input" type="file" accept=".csv,.pdf" className="sr-only" onChange={e => e.target.files?.[0] && selectFile(e.target.files[0])} />
              </div>
              {isPdf && (
                <p className="mt-2 text-xs text-gray-500">
                  PDF statements are converted to rows automatically via Landing.ai — no column mapping needed.
                </p>
              )}
            </div>

            <button
              onClick={parseAndContinue}
              disabled={!file || !selectedPlatformId || parsing || extracting}
              className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {extracting ? 'Extracting — long statements can take several minutes…'
                : parsing ? 'Parsing…'
                : 'Continue →'}
            </button>

            {extracting && (
              <p className="text-sm text-center text-gray-500">
                Parsing the PDF and extracting commission rows. Keep this tab open.
              </p>
            )}

            {/* Explain why button is disabled */}
            {(!file || !selectedPlatformId) && (
              <p className="text-sm text-center text-red-500">
                {!selectedPlatformId && !file
                  ? 'Select a platform and upload a CSV or PDF file to continue.'
                  : !selectedPlatformId
                  ? 'Select a platform to continue.'
                  : 'Upload a CSV or PDF file to continue.'}
              </p>
            )}
          </div>
        )}

        {/* ── STEP: MAP COLUMNS ────────────────────────────────────────────── */}
        {step === 'map' && (
          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Map CSV Columns</h2>
              <p className="text-sm text-gray-500 mt-1">
                File: <strong>{file?.name}</strong> · {allRows.length} rows ·{' '}
                Platform: <strong>{selectedPlatform?.name}</strong>
              </p>
            </div>

            {/* CSV header preview */}
            <div className="bg-gray-50 rounded-md p-3">
              <p className="text-xs font-medium text-gray-500 mb-2">Available columns in this CSV:</p>
              <div className="flex flex-wrap gap-2">
                {headers.map(h => (
                  <span key={h} className="bg-white border border-gray-200 text-xs px-2 py-1 rounded">{h}</span>
                ))}
              </div>
            </div>

            {/* Mapping fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColSelect label="Policy Number" field="policy_number_col" required />
              <ColSelect label="Commission Amount" field="amount_col" required />
              <ColSelect label="Transaction Date" field="date_col" required />
              <ColSelect label="Commission Type" field="commission_type_col" />
              <ColSelect label="Currency" field="currency_col" />
              <ColSelect label="Policy Holder Name" field="policy_holder_col" />
              <ColSelect label="Commencement Date" field="commencement_date_col" />
              <ColSelect label="Payment %" field="payment_pct_col" />
            </div>

            {/* Default currency (used when currency_col is not mapped) */}
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Currency{' '}
                <span className="text-gray-400 font-normal">(used when CSV has no currency column)</span>
              </label>
              <select
                value={mapping.default_currency}
                onChange={e => setMapping(prev => ({ ...prev, default_currency: e.target.value }))}
                className="w-48 border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Save option */}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={saveMapping}
                onChange={e => setSaveMapping(e.target.checked)}
                className="rounded border-gray-300 text-blue-600"
              />
              Remember this mapping for future {selectedPlatform?.name} uploads
            </label>

            <div className="flex gap-3">
              <button onClick={() => setStep('select')} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-md text-sm hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={confirmMapping}
                disabled={!mapping.policy_number_col || !mapping.amount_col || !mapping.date_col}
                className="flex-1 bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply Mapping →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: PREVIEW ────────────────────────────────────────────────── */}
        {step === 'preview' && (
          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Confirm & Process</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {file?.name} · <strong>{allRows.length} rows</strong> · {selectedPlatform?.name}
                  {isPdf && ' · extracted from PDF'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {isPdf && (
                  <button onClick={downloadCsv} className="text-sm text-blue-600 hover:underline">
                    ⬇ Download CSV
                  </button>
                )}
                {!isPdf && (
                  <button
                    onClick={() => setStep('map')}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    ← Change mapping
                  </button>
                )}
              </div>
            </div>

            {/* PDF extraction warnings */}
            {isPdf && (extractWarnings.length > 0 || rowWarnings.length > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4 space-y-2 text-sm text-amber-800">
                <p className="font-semibold">Extraction warnings — review before processing:</p>
                {extractWarnings.length > 0 && (
                  <ul className="space-y-0.5">
                    {extractWarnings.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                )}
                {rowWarnings.length > 0 && (
                  <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                    {rowWarnings.slice(0, 15).map((w, i) => (
                      <li key={i}>• Row {w.row + 1} — {w.message}</li>
                    ))}
                    {rowWarnings.length > 15 && <li>… and {rowWarnings.length - 15} more</li>}
                  </ul>
                )}
                {invalidRowIdx.size > 0 && (
                  <label className="flex items-center gap-2 pt-1 cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={excludeInvalid}
                      onChange={e => setExcludeInvalid(e.target.checked)}
                      className="rounded border-amber-400 text-amber-600"
                    />
                    Exclude {invalidRowIdx.size} row{invalidRowIdx.size === 1 ? '' : 's'} with missing required
                    fields (fix them via Download CSV and re-upload through the CSV flow)
                  </label>
                )}
              </div>
            )}

            {/* Mapping summary */}
            <div className="bg-blue-50 rounded-md p-4 text-sm">
              <p className="font-medium text-blue-800 mb-2">Applied column mapping:</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-blue-700">
                <span>Policy: <strong>{mapping.policy_number_col}</strong></span>
                <span>Amount: <strong>{mapping.amount_col}</strong></span>
                <span>Date: <strong>{mapping.date_col}</strong></span>
                {mapping.commission_type_col && <span>Type: <strong>{mapping.commission_type_col}</strong></span>}
                {mapping.currency_col
                  ? <span>Currency: <strong>{mapping.currency_col}</strong></span>
                  : <span>Currency: <strong>{mapping.default_currency} (default)</strong></span>}
                {mapping.policy_holder_col && <span>Holder: <strong>{mapping.policy_holder_col}</strong></span>}
                {mapping.commencement_date_col && <span>Commencement: <strong>{mapping.commencement_date_col}</strong></span>}
                {mapping.payment_pct_col && <span>Payment %: <strong>{mapping.payment_pct_col}</strong></span>}
              </div>
            </div>

            {/* Data preview */}
            <div className="overflow-x-auto">
              <p className="text-xs text-gray-500 mb-2">First {previewRows.length} rows (mapped view):</p>
              <table className="min-w-full text-xs divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Policy</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Holder</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Amount</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Currency</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {previewRows.map((row, i) => (
                    <tr key={i} className={isPdf && invalidRowIdx.has(i) ? 'bg-red-50' : undefined}>
                      <td className="px-3 py-2 font-mono">{row[mapping.policy_number_col] || '—'}</td>
                      <td className="px-3 py-2">{mapping.policy_holder_col ? (row[mapping.policy_holder_col] || '—') : '—'}</td>
                      <td className="px-3 py-2">{mapping.date_col ? (row[mapping.date_col] || '—') : '—'}</td>
                      <td className="px-3 py-2">{mapping.commission_type_col ? (row[mapping.commission_type_col] || '—') : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{row[mapping.amount_col] || '0'}</td>
                      <td className="px-3 py-2">{mapping.currency_col ? (row[mapping.currency_col] || mapping.default_currency) : mapping.default_currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-md text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={processUpload}
                disabled={processing || rowsToSubmit.length === 0}
                className="flex-1 bg-green-600 text-white py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Process {rowsToSubmit.length} Rows →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: PROCESSING ─────────────────────────────────────────────── */}
        {step === 'processing' && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="animate-spin mx-auto h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full mb-4" />
            <p className="text-lg font-medium text-gray-700">Processing {rowsToSubmit.length} rows…</p>
            <p className="text-sm text-gray-500 mt-1">Querying Azure SQL and saving to database</p>
          </div>
        )}

        {/* ── STEP: DONE ───────────────────────────────────────────────────── */}
        {step === 'done' && result && (
          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Upload Complete</h2>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Total Rows', value: result.total, color: 'blue' },
                { label: 'Saved to DB', value: result.saved, color: 'green' },
                { label: 'Mapped (IFA found)', value: result.mapped, color: 'purple' },
                { label: 'Unmapped', value: result.unmapped, color: 'yellow' },
                { label: 'New IFAs Created', value: result.new_ifas, color: 'indigo' },
                { label: 'Errors', value: result.errors.length, color: result.errors.length > 0 ? 'red' : 'gray' },
              ].map(({ label, value, color }) => {
                const style = RESULT_CARD_STYLES[color] ?? RESULT_CARD_STYLES.gray
                return (
                  <div key={label} className={`${style.bg} p-4 rounded-lg`}>
                    <div className={`text-2xl font-bold ${style.text}`}>{value}</div>
                    <div className="text-sm text-gray-600">{label}</div>
                  </div>
                )
              })}
            </div>

            {result.unmapped > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-800">
                <strong>{result.unmapped} unmapped policies</strong> were not found in Azure SQL.
                Use the <em>Master File → Map Unmapped</em> button after updating the Azure database.
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="font-semibold text-red-800 mb-2 text-sm">Errors ({result.errors.length}):</p>
                <ul className="text-sm text-red-700 space-y-0.5 max-h-40 overflow-y-auto">
                  {result.errors.slice(0, 20).map((e, i) => <li key={i}>• {e}</li>)}
                  {result.errors.length > 20 && <li>… and {result.errors.length - 20} more</li>}
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700">
                Upload Another File
              </button>
              <button onClick={() => router.push('/commission/admin')} className="flex-1 bg-gray-600 text-white py-2 rounded-md text-sm font-medium hover:bg-gray-700">
                Back to Dashboard
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
