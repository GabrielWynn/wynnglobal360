'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthHeaders } from '@/lib/supabase'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import '@/components/commission/ag-theme-commission.css'
import type {
  ColDef,
  CellValueChangedEvent,
  GridReadyEvent,
  CellClassParams,
} from 'ag-grid-community'
import * as XLSX from 'xlsx'
import { computeMergePreview, getMergeBlockReason, type MergeableRecord } from '@/lib/commission-merge'
import { fmtMoney, normalizeCommissionType } from '@/lib/commission-format'
import { useMasterFileColumns } from '@/hooks/useMasterFileColumns'
import { ReconcileModal } from '@/components/commission/master-file/ReconcileModal'
import { DeleteModal } from '@/components/commission/master-file/DeleteModal'

ModuleRegistry.registerModules([AllCommunityModule])

// ── Types ──────────────────────────────────────────────────────────────────────

interface CommissionRecord {
  id: string
  transaction_date: string
  policy_number: string
  policy_holder_name: string | null
  ifa_code: string | null
  ifa_name: string | null
  platform_id: string | null
  commission_type: string | null
  commission_type_code: string | null
  amount: number
  variable_amount: number
  currency: string
  ifa_percentage: number
  suspense_percentage: number
  wgi_percentage: number
  pending_percentage: number
  ifa_amount: number
  suspense_amount: number
  wg_amount: number
  pending_amount: number
  due_wg: number | null
  paid: number
  unpaid: number
  status: string
  rate: number | null
  notes: string | null
  ifa_notes: string | null
  platform_payment_pct: number | null
  commencement_date: string | null
  ape: number | null
  ape_wgi: number | null
  is_deleted: boolean
  is_advance: boolean
  linked_record_id: string | null
  reconciled_at: string | null
  allocation_parent_id: string | null
  payment_batch_id: string | null
  allocations?: CommissionAllocation[]
  platform: { name: string } | null
  upload_batch: { filename: string } | null
}

interface CommissionAllocation {
  id: string
  parent_record_id: string
  child_record_id: string | null
  secondary_ifa_id: string | null
  secondary_ifa_code: string
  secondary_ifa_name: string | null
  percentage: number
  source_bucket: string
  notes: string | null
}

interface IFAEntry      { id: string; code: string; name: string }
interface PlatformEntry { id: string; code: string; name: string }

interface AddForm {
  transaction_date: string
  policy_number: string
  policy_holder_name: string
  ifa_id: string
  platform_id: string
  commission_type: string
  amount: string
  currency: string
  ifa_percentage: string
  suspense_percentage: string
  wgi_percentage: string
  pending_percentage: string
  status: string
  notes: string
  is_advance: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FILTER_STORAGE_KEY  = 'wgi_master_file_filters'
const COLUMN_STATE_KEY    = 'wgi_master_file_columns'

// Numeric + identifier columns render in JetBrains Mono with tabular figures
// (DESIGN-COMMISSION.md). Applied via defaultColDef.cellClass → `.cm-cell-mono`
// (defined in ag-theme-commission.css). Text columns stay in the UI font.
const MONO_FIELDS = new Set<string>([
  'policy_number', 'ifa_code',
  'amount', 'variable_amount', 'adjusted', 'ape', 'ape_wgi',
  'platform_payment_pct', 'rate',
  'ifa_percentage', 'ifa_amount', 'suspense_percentage', 'suspense_amount',
  'wgi_percentage', 'wg_amount', 'pending_percentage', 'pending_amount',
  'due_wg', 'paid', 'unpaid',
])

// Column panel groups — maps colIds to labelled sections in the dropdown
const COL_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Identity',   ids: ['expand', 'transaction_date', 'commencement_date', 'policy_number', 'policy_holder_name', 'ifa_code', 'ifa_name'] },
  { label: 'Commission', ids: ['commission_type', 'amount', 'variable_amount', 'adjusted', 'currency', 'platform_payment_pct', 'ape', 'ape_wgi', 'ifa_percentage', 'ifa_amount', 'suspense_percentage', 'suspense_amount', 'wgi_percentage', 'wg_amount', 'pending_percentage', 'pending_amount'] },
  { label: 'Payment',    ids: ['due_wg', 'paid', 'unpaid', 'status'] },
  { label: 'Metadata',   ids: ['rate', 'notes', 'ifa_notes', 'platform.name', 'upload_batch.filename'] },
]

const FORMULA_FIELDS = [
  { value: 'ifa_percentage',      label: 'IFA %',         hint: '0–100  e.g. 12.5' },
  { value: 'suspense_percentage', label: 'IFA Susp %',    hint: '0–100  e.g. 5' },
  { value: 'wgi_percentage',      label: 'WGI %',         hint: '0–100  e.g. 2.5' },
  { value: 'pending_percentage',  label: 'Pdng %',        hint: '0–100  e.g. 2.5' },
  { value: 'variable_amount',     label: 'Expect ($)',    hint: 'e.g. 200 or -50' },
  { value: 'ape',                 label: 'APE IFA ($)',   hint: 'Annual Premium Equivalent (IFA) e.g. 12000' },
  { value: 'ape_wgi',            label: 'APE WGI ($)',   hint: 'Annual Premium Equivalent (WGI) e.g. 12000' },
  { value: 'due_wg',              label: 'DUE WG ($)',    hint: 'e.g. 100.00' },
  { value: 'paid',                label: 'Paid ($)',    hint: 'e.g. 500.00' },
  { value: 'status',              label: 'Status',      hint: 'pending | approved | paid | cancelled | advance | reconciled' },
  { value: 'rate',                label: 'Rate',        hint: 'e.g. 3.5' },
  { value: 'notes',               label: 'Notes',       hint: 'Any text' },
  { value: 'ifa_notes',           label: 'IFA Notes',   hint: 'Any text' },
]

interface QFDef { label: string; field: string; model: () => Record<string, unknown> }

const QUICK_FILTERS: QFDef[] = [
  { label: 'Unpaid > $0',   field: 'unpaid',           model: () => ({ filterType: 'number', type: 'greaterThan', filter: 0 }) },
  { label: 'Amount > $1k',  field: 'amount',           model: () => ({ filterType: 'number', type: 'greaterThan', filter: 1000 }) },
  {
    label: 'This Month',
    field: 'transaction_date',
    model: () => {
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      return { filterType: 'date', type: 'inRange', dateFrom: `${y}-${m}-01`, dateTo: `${y}-${m}-${last}` }
    },
  },
  {
    label: 'Last 30 Days',
    field: 'transaction_date',
    model: () => {
      const to   = new Date().toISOString().split('T')[0]
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      return { filterType: 'date', type: 'inRange', dateFrom: from, dateTo: to }
    },
  },
]

const defaultAddForm: AddForm = {
  transaction_date: '',
  policy_number: '',
  policy_holder_name: '',
  ifa_id: '',
  platform_id: '',
  commission_type: '',
  amount: '',
  currency: 'USD',
  ifa_percentage: '',
  suspense_percentage: '',
  wgi_percentage: '',
  pending_percentage: '',
  status: 'pending',
  notes: '',
  is_advance: false,
}

// Money / percent / date formatters live in lib/commission-format.ts (imported above).

// ── Allocation detail panel (full-width row renderer) ──────────────────────────

const thS: React.CSSProperties = { padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 11, color: '#1B2D45', whiteSpace: 'nowrap' }
const tdS: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #E2E8F0', fontSize: 12 }

function AllocationDetailPanel(params: any) {
  const record: CommissionRecord = params.data?._parentRecord
  const allocations: CommissionAllocation[] = params.data?._allocations ?? []
  const ctx = params.context ?? {}

  if (!record) return null

  const fmtP = (v: number) => `${(v * 100).toFixed(2)}%`
  const fmtA = (v: number) => `$${v.toFixed(3)}`

  const wgiAllocd  = allocations.filter(a => a.source_bucket === 'wgi').reduce((s, a) => s + a.percentage, 0)
  const ifaAllocd  = allocations.filter(a => a.source_bucket === 'ifa').reduce((s, a) => s + a.percentage, 0)
  const suspAllocd = allocations.filter(a => a.source_bucket === 'suspense').reduce((s, a) => s + a.percentage, 0)

  const origWgi  = record.wgi_percentage  + wgiAllocd
  const origIfa  = record.ifa_percentage  + ifaAllocd
  const origSusp = record.suspense_percentage + suspAllocd

  return (
    <div style={{ padding: '10px 16px 10px 48px', background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1B2D45', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Allocation Breakdown — {record.policy_number} / {record.ifa_code}
        </span>
        <button
          onClick={() => ctx.onAddAllocation?.(record)}
          style={{ fontSize: 11, padding: '3px 10px', background: '#1B2D45', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
        >
          + Add Allocation
        </button>
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
        <thead>
          <tr style={{ background: '#F8FAFC' }}>
            <th style={thS}>Party</th>
            <th style={thS}>Uploaded %</th>
            <th style={thS}>Effective %</th>
            <th style={thS}>Effective Amt</th>
            <th style={thS}>Source</th>
            <th style={thS}>Notes</th>
            <th style={{ ...thS, width: 80 }}></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdS}><strong>{record.ifa_code}</strong> (Primary IFA)</td>
            <td style={tdS}>{fmtP(origIfa)}</td>
            <td style={tdS}>{fmtP(record.ifa_percentage)}</td>
            <td style={tdS}>{fmtA(record.ifa_amount)}</td>
            <td style={tdS}>IFA</td>
            <td style={tdS}></td>
            <td style={tdS}></td>
          </tr>
          <tr>
            <td style={tdS}>WGI</td>
            <td style={tdS}>{fmtP(origWgi)}</td>
            <td style={tdS}>{fmtP(record.wgi_percentage)}</td>
            <td style={tdS}>{fmtA(record.wg_amount)}</td>
            <td style={tdS}>WGI</td>
            <td style={tdS}></td>
            <td style={tdS}></td>
          </tr>
          <tr>
            <td style={tdS}>IFA Suspense</td>
            <td style={tdS}>{fmtP(origSusp)}</td>
            <td style={tdS}>{fmtP(record.suspense_percentage)}</td>
            <td style={tdS}>{fmtA(record.suspense_amount)}</td>
            <td style={tdS}>Suspense</td>
            <td style={tdS}></td>
            <td style={tdS}></td>
          </tr>
          {allocations.map(alloc => (
            <tr key={alloc.id} style={{ background: '#FFF7ED' }}>
              <td style={tdS}>
                <strong style={{ color: '#9A3412' }}>{alloc.secondary_ifa_code}</strong>
                {alloc.secondary_ifa_name ? ` — ${alloc.secondary_ifa_name}` : ''}{' '}
                <span style={{ fontSize: 10, color: '#9A3412', fontStyle: 'italic' }}>(Secondary IFA)</span>
              </td>
              <td style={{ ...tdS, color: '#9ca3af' }}>—</td>
              <td style={{ ...tdS, color: '#9A3412', fontWeight: 700 }}>{fmtP(alloc.percentage)}</td>
              <td style={{ ...tdS, color: '#9A3412', fontWeight: 700 }}>{fmtA(record.amount * alloc.percentage)}</td>
              <td style={tdS}>{alloc.source_bucket.toUpperCase()}</td>
              <td style={tdS}>{alloc.notes ?? ''}</td>
              <td style={tdS}>
                <button
                  onClick={() => ctx.onDeleteAllocation?.(alloc.id)}
                  disabled={ctx.deletingAllocationIdRef?.current === alloc.id}
                  style={{ fontSize: 11, padding: '2px 8px', background: '#FEE2E2', color: '#7F1D1D', border: '1px solid #E2E8F0', borderRadius: 4, cursor: 'pointer' }}
                >
                  {ctx.deletingAllocationIdRef?.current === alloc.id ? '…' : 'Remove'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MasterFilePage() {
  const router = useRouter()
  const gridRef          = useRef<AgGridReact>(null)
  const gridIsReadyRef   = useRef(false)
  const filtersRestoredRef = useRef(false)

  // ── Core data ────────────────────────────────────────────────────────────────
  const [rowData,       setRowData]       = useState<CommissionRecord[]>([])
  const [loading,       setLoading]       = useState(true)
  const [loadError,     setLoadError]     = useState<string | null>(null)
  const [selectedRows,  setSelectedRows]  = useState<CommissionRecord[]>([])
  const [showDeleted,   setShowDeleted]   = useState(false)

  // ── Summary row ──────────────────────────────────────────────────────────────
  const [pinnedBottomRows, setPinnedBottomRows] = useState<Record<string, unknown>[]>([])

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [activeFilterCount,  setActiveFilterCount]  = useState(0)
  const [activeQuickFilters, setActiveQuickFilters] = useState<Set<string>>(new Set())
  const [ifaCodeFilter,      setIfaCodeFilter]      = useState('')
  const [statusFilter,       setStatusFilter]       = useState('')
  const [currencyFilter,     setCurrencyFilter]     = useState('')
  const [platformFilter,     setPlatformFilter]     = useState('')
  const [dateFrom,           setDateFrom]           = useState('')
  const [dateTo,             setDateTo]             = useState('')
  const [commDateFrom,       setCommDateFrom]       = useState('')
  const [commDateTo,         setCommDateTo]         = useState('')

  // ── Bulk formula ─────────────────────────────────────────────────────────────
  const [formulaField,    setFormulaField]    = useState('ifa_percentage')
  const [formulaValue,    setFormulaValue]    = useState('')
  const [formulaApplying, setFormulaApplying] = useState(false)

  // ── Custom bottom bar: pagination ─────────────────────────────────────────────
  const [pgPage,      setPgPage]      = useState(0)   // 0-indexed
  const [pgTotal,     setPgTotal]     = useState(0)
  const [pgSize,      setPgSize]      = useState(500)
  const [pgRowCount,  setPgRowCount]  = useState(0)

  // ── Custom bottom bar: horizontal scroll ──────────────────────────────────────
  const [hScrollPos,  setHScrollPos]  = useState(0)   // 0–1 fraction
  const [hScrollMax,  setHScrollMax]  = useState(0)   // max scrollable px
  const hScrollTrackRef = useRef<HTMLDivElement>(null)
  const hScrollThumbRef = useRef<HTMLDivElement>(null)
  const isDraggingRef   = useRef(false)
  const dragStartXRef   = useRef(0)
  const dragStartPosRef = useRef(0)

  // ── Add modal ────────────────────────────────────────────────────────────────
  const [addModal,      setAddModal]      = useState(false)
  const [addForm,       setAddForm]       = useState<AddForm>(defaultAddForm)
  const [addSaving,     setAddSaving]     = useState(false)
  const [addError,      setAddError]      = useState('')
  const [ifaList,       setIfaList]       = useState<IFAEntry[]>([])
  const [platformList,  setPlatformList]  = useState<PlatformEntry[]>([])

  // ── Delete modal ─────────────────────────────────────────────────────────────
  const [deleteModal,   setDeleteModal]   = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteTyped,   setDeleteTyped]   = useState('')
  const [deleting,      setDeleting]      = useState(false)

  // ── Reconcile ─────────────────────────────────────────────────────────────────
  const [reconcileModal, setReconcileModal] = useState(false)
  const [reconciling,    setReconciling]    = useState(false)

  // ── Merge selected rows ───────────────────────────────────────────────────────
  const [mergeModal,     setMergeModal]     = useState(false)
  const [mergeSurvivorId, setMergeSurvivorId] = useState('')
  const [merging,        setMerging]        = useState(false)
  const [mergeError,     setMergeError]     = useState('')

  // ── Allocations ───────────────────────────────────────────────────────────────
  const [allocationsByParent, setAllocationsByParent] = useState<Map<string, CommissionAllocation[]>>(new Map())
  const [deletingAllocId,     setDeletingAllocId]     = useState<string | null>(null)
  // Side panel — shows breakdown for the selected parent record
  const [detailRecord,        setDetailRecord]        = useState<CommissionRecord | null>(null)

  // Refs — keep cell renderer closures (inside useMemo([])) in sync with latest state
  const allocationsByParentRef = useRef(allocationsByParent)
  const detailRecordRef        = useRef(detailRecord)
  allocationsByParentRef.current = allocationsByParent
  detailRecordRef.current        = detailRecord

  const [allocModal,   setAllocModal]   = useState<{ open: boolean; parentRecord: CommissionRecord | null }>({ open: false, parentRecord: null })
  const [allocForm,    setAllocForm]    = useState({ secondary_ifa_id: '', percentage: '', source_bucket: 'wgi', notes: '' })
  const [allocSaving,  setAllocSaving]  = useState(false)
  const [allocError,   setAllocError]   = useState('')

  // ── Full-screen ───────────────────────────────────────────────────────────────
  const [fullScreen, setFullScreen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullScreen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ── Density (zoom) ────────────────────────────────────────────────────────────
  const [density, setDensity] = useState<'compact' | 'normal' | 'cozy'>('normal')
  const ROW_HEIGHTS = { compact: 24, normal: 36, cozy: 52 } as const

  // ── Column panel ──────────────────────────────────────────────────────────────
  const [colPanelOpen, setColPanelOpen] = useState(false)
  const [colSnapshot, setColSnapshot] = useState<{ colId: string; hide: boolean; pinned: string | null }[]>([])
  const colPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!colPanelOpen) return
    function handleOutsideClick(e: MouseEvent) {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) {
        setColPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [colPanelOpen])

  // ── Feedback ─────────────────────────────────────────────────────────────────
  const [feedback, setFeedback] = useState('')
  function showFeedback(msg: string) {
    setFeedback(msg)
    setTimeout(() => setFeedback(''), 5000)
  }

  // ── Column state helpers ──────────────────────────────────────────────────────
  function saveColumnState() {
    const api = gridRef.current?.api
    if (!api) return
    localStorage.setItem(COLUMN_STATE_KEY, JSON.stringify(api.getColumnState()))
  }

  function openColPanel() {
    const api = gridRef.current?.api
    if (!api) return
    const state = api.getColumnState()
    setColSnapshot(state.map(s => ({ colId: s.colId, hide: !!s.hide, pinned: s.pinned === 'left' ? 'left' : null })))
    setColPanelOpen(true)
  }

  function toggleColVisibility(colId: string, visible: boolean) {
    const api = gridRef.current?.api
    if (!api) return
    api.setColumnsVisible([colId], visible)
    setColSnapshot(prev => prev.map(s => s.colId === colId ? { ...s, hide: !visible } : s))
    saveColumnState()
  }

  function toggleColPin(colId: string, pinLeft: boolean) {
    const api = gridRef.current?.api
    if (!api) return
    api.setColumnsPinned([colId], pinLeft ? 'left' : null)
    setColSnapshot(prev => prev.map(s => s.colId === colId ? { ...s, pinned: pinLeft ? 'left' : null } : s))
    saveColumnState()
  }

  function showAllColumns() {
    const api = gridRef.current?.api
    if (!api) return
    const allIds = api.getColumnState().map(s => s.colId)
    api.setColumnsVisible(allIds, true)
    setColSnapshot(prev => prev.map(s => ({ ...s, hide: false })))
    saveColumnState()
  }

  function resetColumnLayout() {
    localStorage.removeItem(COLUMN_STATE_KEY)
    setColPanelOpen(false)
    window.location.reload()
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => { checkAuthAndLoad() }, []) // eslint-disable-line

  // Restore persisted filters once data is loaded
  useEffect(() => {
    if (!loading) maybeRestoreFilters()
  }, [loading]) // eslint-disable-line

  async function checkAuthAndLoad() {
    await loadData(false)
  }

  // ── Data load ────────────────────────────────────────────────────────────────
  async function loadData(includeDeleted = showDeleted) {
    setLoading(true)
    try {
      const authHeaders = await getAuthHeaders()
      const url = `/api/commission/commission-records${includeDeleted ? '?include_deleted=true' : ''}`
      const res = await fetch(url, { headers: authHeaders })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error ?? `HTTP ${res.status}`)
      }
      const { records } = await res.json()
      setRowData(records ?? [])

      // Build allocations map from inline data
      const map = new Map<string, CommissionAllocation[]>()
      for (const r of (records ?? [])) {
        if (r.allocations && r.allocations.length > 0) {
          map.set(r.id, r.allocations)
        }
      }
      setAllocationsByParent(map)
      // Refresh detail panel record from the new data, or close if no longer has allocations
      setDetailRecord(prev => {
        if (!prev) return null
        const fresh = (records ?? []).find((r: any) => r.id === prev.id)
        return (fresh && map.has(fresh.id)) ? fresh : null
      })
    } catch (err: any) {
      const msg: string = err?.message ?? err?.code ?? JSON.stringify(err)
      console.error('Error loading commission records:', msg)
      setLoadError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Persistent filter restore ─────────────────────────────────────────────────
  function maybeRestoreFilters() {
    if (!gridIsReadyRef.current || filtersRestoredRef.current) return
    if (!gridRef.current?.api) return
    const saved = localStorage.getItem(FILTER_STORAGE_KEY)
    if (saved) {
      try { gridRef.current.api.setFilterModel(JSON.parse(saved)) } catch {}
    }
    filtersRestoredRef.current = true
  }

  // ── Summary row computation ───────────────────────────────────────────────────
  function recomputeSummary() {
    const api = gridRef.current?.api
    if (!api) return

    let filteredCount = 0
    let fAmt = 0, fIFA = 0, fSusp = 0, fWG = 0, fPdng = 0, fPaid = 0, fUnpaid = 0
    let fAdj = 0, fVar = 0, fApe = 0, fApeWgi = 0, fDueWg = 0
    api.forEachNodeAfterFilter(node => {
      if (node.rowPinned || !node.data) return
      const r = node.data as CommissionRecord
      filteredCount++
      // Child allocation rows are excluded from Received/Expect/Gross — that money
      // is already counted on the parent row. IFA/Unpaid/Paid are included because
      // the secondary IFA is owed real commission.
      const isChild = !!r.allocation_parent_id
      if (!isChild) {
        fAmt += r.amount          ?? 0
        fVar += r.variable_amount ?? 0
        fAdj += (r.amount ?? 0) + (r.variable_amount ?? 0)
      }
      fIFA    += r.ifa_amount      ?? 0
      fSusp   += r.suspense_amount ?? 0
      fWG     += r.wg_amount       ?? 0
      fPdng   += r.pending_amount  ?? 0
      fPaid   += r.paid            ?? 0
      fUnpaid += r.unpaid          ?? 0
      fApe    += r.ape             ?? 0
      fApeWgi += r.ape_wgi         ?? 0
      fDueWg  += r.due_wg          ?? 0
    })

    const allRow: Record<string, unknown> = {
      _summary: true, _selected: false,
      _label: `ALL FILTERED: ${filteredCount} rows`,
      amount: fAmt, ifa_amount: fIFA,
      suspense_amount: fSusp, wg_amount: fWG,
      pending_amount: fPdng,
      paid: fPaid, unpaid: fUnpaid,
      variable_amount: fVar, adjusted: fAdj, ape: fApe,
      ape_wgi: fApeWgi, due_wg: fDueWg,
    }

    const sel = api.getSelectedRows() as CommissionRecord[]
    if (sel.length > 0) {
      let sAmt = 0, sIFA = 0, sSusp = 0, sWG = 0, sPdng = 0, sPaid = 0, sUnpaid = 0
      let sAdj = 0, sVar = 0, sApe = 0, sApeWgi = 0, sDueWg = 0
      sel.forEach(r => {
        const isChild = !!r.allocation_parent_id
        if (!isChild) {
          sAmt += r.amount          ?? 0
          sVar += r.variable_amount ?? 0
          sAdj += (r.amount ?? 0) + (r.variable_amount ?? 0)
        }
        sIFA    += r.ifa_amount      ?? 0
        sSusp   += r.suspense_amount ?? 0
        sWG     += r.wg_amount       ?? 0
        sPdng   += r.pending_amount  ?? 0
        sPaid   += r.paid            ?? 0
        sUnpaid += r.unpaid          ?? 0
        sApe    += r.ape             ?? 0
        sApeWgi += r.ape_wgi         ?? 0
        sDueWg  += r.due_wg          ?? 0
      })
      const selRow: Record<string, unknown> = {
        _summary: true, _selected: true,
        _label: `SELECTED: ${sel.length} rows`,
        amount: sAmt, ifa_amount: sIFA,
        suspense_amount: sSusp, wg_amount: sWG,
        pending_amount: sPdng,
        paid: sPaid, unpaid: sUnpaid,
        variable_amount: sVar, adjusted: sAdj, ape: sApe,
        ape_wgi: sApeWgi, due_wg: sDueWg,
      }
      setPinnedBottomRows([allRow, selRow])
    } else {
      setPinnedBottomRows([allRow])
    }
  }

  // ── Allocation panel / modal handlers ────────────────────────────────────────
  // Refresh expand column whenever alloc map or open panel changes
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ columns: ['expand'], force: true })
  }, [allocationsByParent, detailRecord])

  const openAllocModalCb = useCallback((parentRecord: CommissionRecord) => {
    setAllocModal({ open: true, parentRecord })
    setAllocForm({ secondary_ifa_id: '', percentage: '', source_bucket: 'wgi', notes: '' })
    setAllocError('')
    if (ifaList.length === 0) {
      getAuthHeaders().then(headers =>
        fetch('/api/commission/ifas', { headers })
          .then(r => r.json())
          .then(({ ifas }) => setIfaList(((ifas ?? []) as { id: string; code: string; name: string }[]).map(i => ({ id: i.id, code: i.code, name: i.name }))))
      )
    }
  }, [ifaList.length]) // eslint-disable-line

  const handleDeleteAllocationCb = useCallback(async (allocationId: string) => {
    if (!confirm('Remove this allocation? The child commission record will be soft-deleted and the parent percentage restored.')) return
    setDeletingAllocId(allocationId)
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch(`/api/commission/commission-records/allocations?id=${allocationId}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      const result = await res.json()
      if (!res.ok) { alert(`Failed to remove: ${result.error}`); return }
      showFeedback('Allocation removed.')
      await loadData()
    } finally {
      setDeletingAllocId(null)
    }
  }, []) // eslint-disable-line

  async function handleSubmitAllocation() {
    const parent = allocModal.parentRecord
    if (!parent) return
    if (!allocForm.secondary_ifa_id) { setAllocError('Select a secondary IFA'); return }
    const pct = parseFloat(allocForm.percentage) / 100
    if (isNaN(pct) || pct <= 0 || pct > 1) { setAllocError('Enter a valid percentage between 0 and 100'); return }
    const selectedIFA = ifaList.find(i => i.id === allocForm.secondary_ifa_id)
    setAllocSaving(true)
    setAllocError('')
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/commission/commission-records/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          parent_record_id:   parent.id,
          secondary_ifa_id:   allocForm.secondary_ifa_id,
          secondary_ifa_code: selectedIFA?.code ?? '',
          secondary_ifa_name: selectedIFA?.name ?? null,
          percentage:         pct,
          source_bucket:      allocForm.source_bucket,
          notes:              allocForm.notes.trim() || null,
        }),
      })
      const result = await res.json()
      if (!res.ok) { setAllocError(result.error); return }
      setAllocModal({ open: false, parentRecord: null })
      showFeedback('Allocation created. Child record added for secondary IFA.')
      await loadData()
      // Re-open the detail panel with refreshed data after load
      setDetailRecord(prev => prev?.id === parent.id ? prev : prev)
    } finally {
      setAllocSaving(false)
    }
  }

  // ── Column Definitions ────────────────────────────────────────────────────────
  const columnDefs = useMasterFileColumns({
    allocationsByParentRef,
    detailRecordRef,
    setDetailRecord,
    openAllocModalCb,
  })

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true, filter: true,
    cellClass: (p: CellClassParams) => {
      const key = p.colDef.field ?? p.colDef.colId ?? ''
      return MONO_FIELDS.has(key) ? 'cm-cell-mono' : ''
    },
  }), [])

  // ── Cell edit ────────────────────────────────────────────────────────────────
  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef } = event
    const field = colDef.field as string
    const editableFields = ['ifa_percentage', 'suspense_percentage', 'wgi_percentage', 'pending_percentage', 'variable_amount', 'ape', 'ape_wgi', 'due_wg', 'paid', 'status', 'rate', 'notes', 'ifa_notes']
    if (!editableFields.includes(field)) return

    const updatePayload: Record<string, unknown> = { [field]: data[field], updated_at: new Date().toISOString() }

    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/commission/commission-records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ ids: [data.id], updates: updatePayload }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      if (result.record) {
        gridRef.current?.api.applyTransaction({ update: [result.record as unknown as CommissionRecord] })
        recomputeSummary()
      } else {
        await loadData()
      }
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`)
      await loadData()
    }
  }, []) // eslint-disable-line

  // ── Selection ────────────────────────────────────────────────────────────────
  const onSelectionChanged = useCallback(() => {
    const rows = (gridRef.current?.api.getSelectedRows() ?? []).filter((r: any) => !r._isDetailRow)
    setSelectedRows(rows)
    recomputeSummary()
  }, []) // eslint-disable-line

  // ── Filter handlers ───────────────────────────────────────────────────────────
  function onFilterChanged() {
    const api = gridRef.current?.api
    if (!api) return
    const model = api.getFilterModel() ?? {}
    const count = Object.keys(model).length
    setActiveFilterCount(count)
    if (count > 0) {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(model))
    } else {
      localStorage.removeItem(FILTER_STORAGE_KEY)
    }
    recomputeSummary()
  }

  // ── Quick filters ─────────────────────────────────────────────────────────────
  function toggleQuickFilter(qf: QFDef) {
    const api = gridRef.current?.api
    if (!api) return
    const model = { ...(api.getFilterModel() ?? {}) } as Record<string, unknown>
    const isActive = activeQuickFilters.has(qf.label)
    if (isActive) {
      delete model[qf.field]
      api.setFilterModel(model)
      setActiveQuickFilters(prev => { const s = new Set(prev); s.delete(qf.label); return s })
    } else {
      model[qf.field] = qf.model()
      api.setFilterModel(model)
      setActiveQuickFilters(prev => {
        const s = new Set(prev)
        // Deactivate other quick filters that share the same field (e.g. This Month vs Last 30 Days)
        QUICK_FILTERS.forEach(other => {
          if (other.field === qf.field && other.label !== qf.label) s.delete(other.label)
        })
        s.add(qf.label)
        return s
      })
    }
  }

  function applyDateRangeFilter(
    field: string,
    from: string, setFrom: (v: string) => void,
    to:   string, setTo:   (v: string) => void,
    newFrom?: string, newTo?: string,
  ) {
    const api = gridRef.current?.api
    if (!api) return
    const resolvedFrom = newFrom !== undefined ? newFrom : from
    const resolvedTo   = newTo   !== undefined ? newTo   : to
    if (newFrom !== undefined) setFrom(newFrom)
    if (newTo   !== undefined) setTo(newTo)
    const model = { ...(api.getFilterModel() ?? {}) } as Record<string, unknown>
    if (resolvedFrom || resolvedTo) {
      model[field] = {
        filterType: 'date',
        type: 'inRange',
        dateFrom: resolvedFrom || '1900-01-01',
        dateTo:   resolvedTo   || '2999-12-31',
      }
    } else {
      delete model[field]
    }
    api.setFilterModel(model)
  }

  function applyDropdownFilter(field: string, val: string, setter: (v: string) => void) {
    const api = gridRef.current?.api
    if (!api) return
    const model = { ...(api.getFilterModel() ?? {}) } as Record<string, unknown>
    if (!val) { delete model[field] } else { model[field] = { filterType: 'text', type: 'equals', filter: val } }
    api.setFilterModel(model)
    setter(val)
  }

  function clearAllFilters() {
    gridRef.current?.api.setFilterModel(null)
    localStorage.removeItem(FILTER_STORAGE_KEY)
    setActiveFilterCount(0)
    setActiveQuickFilters(new Set())
    setIfaCodeFilter('')
    setStatusFilter('')
    setCurrencyFilter('')
    setPlatformFilter('')
    setDateFrom(''); setDateTo('')
    setCommDateFrom(''); setCommDateTo('')
  }

  // ── Filter option lists ───────────────────────────────────────────────────────
  const allIfaCodes = useMemo(() => {
    const set = new Set<string>()
    rowData.forEach(r => { if (r.ifa_code) set.add(r.ifa_code) })
    return [...set].sort()
  }, [rowData])

  const uniqueCurrencies = useMemo(() => {
    const set = new Set<string>()
    rowData.forEach(r => { if (r.currency) set.add(r.currency) })
    return [...set].sort()
  }, [rowData])

  const uniquePlatforms = useMemo(() => {
    const set = new Set<string>()
    rowData.forEach(r => { if (r.platform?.name) set.add(r.platform.name) })
    return [...set].sort()
  }, [rowData])

  // ── Selection helpers ─────────────────────────────────────────────────────────
  function selectAllFiltered() {
    gridRef.current?.api.forEachNodeAfterFilter(node => {
      if (!node.rowPinned && !node.data?._isDetailRow) node.setSelected(true)
    })
  }
  function selectNone() { gridRef.current?.api.deselectAll() }

  // ── Custom pagination handlers ────────────────────────────────────────────────
  const onPaginationChanged = useCallback(() => {
    const api = gridRef.current?.api
    if (!api) return
    setPgPage(api.paginationGetCurrentPage())
    setPgTotal(api.paginationGetTotalPages())
    setPgSize(api.paginationGetPageSize())
    setPgRowCount(api.paginationGetRowCount())
  }, [])

  // ── Custom horizontal scroll handlers ─────────────────────────────────────────
  // ag-grid keeps its scroll state in .ag-body-horizontal-scroll-viewport
  // (the parent .ag-body-horizontal-scroll is collapsed to height:0 via CSS so it's
  //  invisible but still live, meaning scrollWidth is correctly maintained by ag-grid)
  const getAgHScrollViewport = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('.ag-body-horizontal-scroll-viewport')

  const syncHScroll = useCallback(() => {
    const vp = getAgHScrollViewport()
    if (!vp) return
    const max = vp.scrollWidth - vp.clientWidth
    setHScrollMax(Math.max(0, max))
    setHScrollPos(max > 0 ? vp.scrollLeft / max : 0)
  }, [])

  const scrollGridTo = useCallback((fraction: number) => {
    const vp = getAgHScrollViewport()
    if (!vp) return
    const clamped = Math.max(0, Math.min(1, fraction))
    // Writing to the ag-grid scroll viewport triggers ag-grid's internal listener
    // which applies the horizontal position to the column containers
    vp.scrollLeft = Math.round(clamped * hScrollMax)
    setHScrollPos(clamped)
  }, [hScrollMax])

  // Thumb drag
  const onThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    dragStartXRef.current = e.clientX
    dragStartPosRef.current = hScrollPos
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !hScrollTrackRef.current) return
      const trackW = hScrollTrackRef.current.clientWidth
      const thumbW = hScrollThumbRef.current?.clientWidth ?? 40
      const dx = ev.clientX - dragStartXRef.current
      const newFraction = dragStartPosRef.current + dx / (trackW - thumbW)
      scrollGridTo(newFraction)
    }
    const onUp = () => {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [hScrollPos, scrollGridTo])

  // Click on track (not thumb) jumps to that position
  const onTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!hScrollTrackRef.current || isDraggingRef.current) return
    const rect = hScrollTrackRef.current.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    scrollGridTo(fraction)
  }, [scrollGridTo])

  // ── Bulk ops ──────────────────────────────────────────────────────────────────
  async function bulkUpdateStatus(newStatus: string) {
    if (!selectedRows.length) { alert('Select rows first'); return }
    if (!confirm(`Set ${selectedRows.length} record(s) to "${newStatus}"?`)) return
    const authHeaders = await getAuthHeaders()
    const res = await fetch('/api/commission/commission-records', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ ids: selectedRows.map(r => r.id), updates: { status: newStatus, updated_at: new Date().toISOString() } }),
    })
    const data = await res.json()
    if (!res.ok) { alert(`Failed: ${data.error}`); return }
    showFeedback(`${selectedRows.length} record(s) set to "${newStatus}".`)
    await loadData()
  }

  async function bulkMarkAsPaid() {
    if (!selectedRows.length) { alert('Select rows first'); return }
    if (!confirm(`Mark ${selectedRows.length} record(s) as paid?`)) return
    const authHeaders = await getAuthHeaders()
    const res = await fetch('/api/commission/commission-records', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ ids: selectedRows.map(r => r.id), mark_paid: true }),
    })
    const data = await res.json()
    if (!res.ok) { alert(`Failed: ${data.error}`); return }
    showFeedback(`${selectedRows.length} record(s) marked paid.`)
    await loadData()
  }

  async function bulkApplyFormula() {
    const eligibleRows = selectedRows.filter(r => !r.allocation_parent_id)
    if (!eligibleRows.length) { alert('No eligible rows selected (child allocation records cannot be bulk-edited)'); return }
    if (!formulaValue.trim()) { alert('Enter a value'); return }
    let dbValue: string | number = formulaValue.trim()
    if (['ifa_percentage', 'suspense_percentage', 'wgi_percentage', 'pending_percentage'].includes(formulaField)) {
      const v = parseFloat(formulaValue.replace('%', '').trim())
      if (isNaN(v) || v < 0 || v > 100) { alert('Enter a valid % between 0 and 100'); return }
      dbValue = v / 100
    } else if (formulaField === 'variable_amount') {
      const v = parseFloat(formulaValue.replace(/[$,]/g, '').trim())
      if (isNaN(v)) { alert('Enter a valid number (positive or negative)'); return }
      dbValue = v
    } else if (formulaField === 'ape' || formulaField === 'ape_wgi') {
      const v = parseFloat(formulaValue.replace(/[$,]/g, '').trim())
      if (isNaN(v) || v < 0) { alert('Enter a valid APE amount (positive number)'); return }
      dbValue = v
    } else if (['due_wg', 'paid'].includes(formulaField)) {
      const v = parseFloat(formulaValue.replace(/[$,]/g, '').trim())
      if (isNaN(v) || v < 0) { alert('Enter a valid amount'); return }
      dbValue = v
    }
    const label = FORMULA_FIELDS.find(f => f.value === formulaField)?.label ?? formulaField
    if (!confirm(`Apply "${label} = ${formulaValue}" to ${eligibleRows.length} record(s)?`)) return
    setFormulaApplying(true)
    const authHeaders = await getAuthHeaders()
    const res = await fetch('/api/commission/commission-records', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ ids: eligibleRows.map(r => r.id), updates: { [formulaField]: dbValue, updated_at: new Date().toISOString() } }),
    })
    const data = await res.json()
    setFormulaApplying(false)
    if (!res.ok) { alert(`Failed: ${data.error}`); return }
    showFeedback(`Applied "${label} = ${formulaValue}" to ${eligibleRows.length} record(s).`)
    setFormulaValue('')
    await loadData()
  }

  // ── Add record ────────────────────────────────────────────────────────────────
  async function openAddModal() {
    setAddForm({ ...defaultAddForm, transaction_date: new Date().toISOString().split('T')[0] })
    setAddError('')
    setAddModal(true)
    if (ifaList.length === 0) {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/commission/ifas', { headers })
      const { ifas } = await res.json()
      setIfaList(((ifas ?? []) as { id: string; code: string; name: string }[]).map(i => ({ id: i.id, code: i.code, name: i.name })))
    }
    if (platformList.length === 0) {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/commission/platforms', { headers })
      const { platforms } = await res.json()
      setPlatformList((platforms ?? []) as PlatformEntry[])
    }
  }

  async function handleAddRecord() {
    if (!addForm.policy_number.trim()) { setAddError('Policy number is required'); return }
    const amt = parseFloat(addForm.amount)
    if (isNaN(amt) || amt <= 0) { setAddError('Amount must be a positive number'); return }
    setAddSaving(true)
    setAddError('')
    const selectedIFA = ifaList.find(i => i.id === addForm.ifa_id)
    const authHeaders = await getAuthHeaders()
    const res = await fetch('/api/commission/commission-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        transaction_date:    addForm.transaction_date,
        policy_number:       addForm.policy_number.trim(),
        policy_holder_name:  addForm.policy_holder_name.trim() || null,
        ifa_id:              selectedIFA?.id ?? null,
        ifa_code:            selectedIFA?.code ?? null,
        ifa_name:            selectedIFA?.name ?? null,
        platform_id:         addForm.platform_id || null,
        commission_type:      addForm.commission_type.trim() || null,
        commission_type_code: normalizeCommissionType(addForm.commission_type.trim()),
        amount:              amt,
        currency:            addForm.currency || 'USD',
        ifa_percentage:      addForm.ifa_percentage      ? parseFloat(addForm.ifa_percentage)      / 100 : null,
        suspense_percentage: addForm.suspense_percentage ? parseFloat(addForm.suspense_percentage) / 100 : null,
        wgi_percentage:      addForm.wgi_percentage      ? parseFloat(addForm.wgi_percentage)      / 100 : null,
        pending_percentage:  addForm.pending_percentage  ? parseFloat(addForm.pending_percentage)  / 100 : null,
        status:              addForm.is_advance ? 'advance' : addForm.status,
        is_advance:          addForm.is_advance,
        notes:               addForm.notes.trim() || null,
      }),
    })
    const result = await res.json()
    setAddSaving(false)
    if (!res.ok) { setAddError(result.error); return }
    setAddModal(false)
    showFeedback('Record added successfully.')
    await loadData()
  }

  // ── Soft delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true)
    const ids = selectedRows.map(r => r.id)
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/commission/commission-records/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) { alert(`Delete failed: ${data.error}`); return }
      setDeleteModal(false)
      setDeleteConfirm(false)
      setDeleteTyped('')
      setSelectedRows([])
      showFeedback(`${ids.length} record(s) deleted.`)
      await loadData()
    } finally {
      setDeleting(false)
    }
  }

  // ── Merge ─────────────────────────────────────────────────────────────────────
  const mergeCandidates = useMemo((): MergeableRecord[] => {
    return selectedRows.map(r => ({
      id: r.id,
      policy_number: r.policy_number,
      ifa_code: r.ifa_code,
      currency: r.currency,
      platform_id: r.platform_id,
      amount: r.amount,
      variable_amount: r.variable_amount,
      paid: r.paid,
      ifa_amount: r.ifa_amount,
      status: r.status,
      is_deleted: r.is_deleted,
      is_advance: r.is_advance,
      linked_record_id: r.linked_record_id,
      allocation_parent_id: r.allocation_parent_id,
      payment_batch_id: r.payment_batch_id,
      transaction_date: r.transaction_date,
      commission_type: r.commission_type,
      has_allocations:
        (allocationsByParent.has(r.id) && (allocationsByParent.get(r.id)?.length ?? 0) > 0) ||
        ((r.allocations?.length ?? 0) > 0),
    }))
  }, [selectedRows, allocationsByParent])

  const mergeBlockReason = useMemo(
    () => (selectedRows.length >= 2 ? getMergeBlockReason(mergeCandidates) : null),
    [selectedRows.length, mergeCandidates],
  )

  const mergePreview = useMemo(() => {
    if (mergeBlockReason || mergeCandidates.length < 2) return null
    return computeMergePreview(mergeCandidates)
  }, [mergeBlockReason, mergeCandidates])

  function openMergeModal() {
    if (mergeBlockReason) {
      alert(mergeBlockReason)
      return
    }
    const sorted = [...selectedRows].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
    setMergeSurvivorId(sorted[0]?.id ?? '')
    setMergeError('')
    setMergeModal(true)
  }

  async function handleConfirmMerge() {
    if (!mergeSurvivorId || mergeCandidates.length < 2) return
    setMerging(true)
    setMergeError('')
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/commission/commission-records/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          ids: mergeCandidates.map(r => r.id),
          survivor_id: mergeSurvivorId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Merge failed')
      setMergeModal(false)
      setSelectedRows([])
      gridRef.current?.api.deselectAll()
      showFeedback(
        `Merged ${data.merged_count} row(s) into one record for policy ${data.record?.policy_number ?? ''}.`,
      )
      await loadData()
    } catch (err: any) {
      setMergeError(err.message ?? 'Merge failed')
    } finally {
      setMerging(false)
    }
  }

  // ── Reconcile ─────────────────────────────────────────────────────────────────
  async function handleReconcile() {
    const advanceRow   = selectedRows.find(r => r.is_advance)
    const statementRow = selectedRows.find(r => !r.is_advance)
    if (!advanceRow || !statementRow) return
    setReconciling(true)
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/commission/commission-records/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ advance_id: advanceRow.id, statement_id: statementRow.id }),
      })
      const data = await res.json()
      if (!res.ok) { alert(`Reconcile failed: ${data.error}`); return }
      setReconcileModal(false)
      setSelectedRows([])
      showFeedback('Records reconciled. Statement entry marked as covered by advance.')
      await loadData()
    } finally {
      setReconciling(false)
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  function exportToExcel() {
    const rows: Record<string, unknown>[] = []
    gridRef.current?.api.forEachNodeAfterFilter(node => {
      if (!node.data || node.rowPinned) return
      if (node.data._isDetailRow) return
      const r = node.data as CommissionRecord
      rows.push({
        'Trans Date': r.transaction_date, 'Issue Date': r.commencement_date ?? '', Policy: r.policy_number, Holder: r.policy_holder_name ?? '',
        'IFA Code': r.ifa_code ?? '', 'IFA Name': r.ifa_name ?? '', Type: r.commission_type ?? '',
        Received: r.amount, Expect: r.variable_amount ?? 0, Gross: (r.amount ?? 0) + (r.variable_amount ?? 0),
        Currency: r.currency, 'IA Rate': r.platform_payment_pct ?? '', 'APE IFA': r.ape ?? '', 'APE WGI': r.ape_wgi ?? '',
        'IFA %': r.ifa_percentage, 'IFA Comm': r.ifa_amount,
        'IFA Susp %': r.suspense_percentage, 'IFA Susp': r.suspense_amount,
        'WGI %': r.wgi_percentage, 'WG O/R': r.wg_amount,
        'Pdng %': r.pending_percentage, 'Pdng$': r.pending_amount, 'DUE WG': r.due_wg ?? '',
        Paid: r.paid, Unpaid: r.unpaid, Status: r.status, Rate: r.rate ?? '', Notes: r.notes ?? '', 'IFA Notes': r.ifa_notes ?? '',
        Platform: r.platform?.name ?? '', 'Source File': r.upload_batch?.filename ?? 'manual entry',
      })
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Commission Records')
    XLSX.writeFile(wb, `commission_records_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  // ── Error / initial load screen ───────────────────────────────────────────────
  if (loading && rowData.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--wgi-navy)] mx-auto" />
          <p className="mt-4 text-gray-600">Loading commission records…</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-lg shadow p-8 max-w-lg text-center">
          <p className="text-red-600 font-semibold text-lg mb-2">Failed to load</p>
          <p className="text-gray-600 text-sm mb-4 font-mono bg-red-50 rounded p-2">{loadError}</p>
          <button onClick={() => { setLoadError(null); loadData() }}
            className="px-4 py-2 bg-[var(--wgi-navy)] text-white rounded hover:bg-[var(--wgi-navy-600)] text-sm">
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const totalAmount = rowData.reduce((s, r) => s + (r.allocation_parent_id ? 0 : (r.amount ?? 0)), 0)
  const totalIFA    = rowData.reduce((s, r) => s + (r.ifa_amount ?? 0), 0)
  const totalPaid   = rowData.reduce((s, r) => s + (r.paid ?? 0), 0)
  const totalUnpaid = rowData.reduce((s, r) => s + (r.unpaid ?? 0), 0)
  const currentHint = FORMULA_FIELDS.find(f => f.value === formulaField)?.hint ?? ''

  const prevAmt   = parseFloat(addForm.amount || '0')
  const previewIFA  = prevAmt * parseFloat(addForm.ifa_percentage  || '0') / 100
  const previewSusp = prevAmt * parseFloat(addForm.suspense_percentage || '0') / 100
  const previewWGI  = prevAmt * parseFloat(addForm.wgi_percentage  || '0') / 100
  const previewPdng = prevAmt * parseFloat(addForm.pending_percentage  || '0') / 100

  const paidSelectedCount      = selectedRows.filter(r => r.status === 'paid').length
  const requireTypedConfirm    = selectedRows.length > 100
  const deleteEnabled          = requireTypedConfirm ? deleteTyped === 'DELETE' : deleteConfirm
  const canReconcile           = selectedRows.length === 2 && selectedRows.some(r => r.is_advance) && selectedRows.some(r => !r.is_advance) && selectedRows.every(r => !r.linked_record_id)

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={`bg-[var(--wgi-bg)] flex flex-col ${fullScreen ? 'fixed inset-0 z-50' : 'h-[calc(100vh-105px)] overflow-hidden'}`}>

      {/* ── Single merged toolbar strip ── */}
      {!fullScreen && (
        <div className="bg-white border-b border-gray-200 flex-shrink-0 flex items-stretch h-12">

          {/* LEFT — always visible: back link + title */}
          <div className="flex items-center gap-2.5 px-4 flex-shrink-0 border-r border-gray-200 bg-slate-50">
            <button
              onClick={() => router.push('/commission/admin')}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-[var(--wgi-navy)] font-medium whitespace-nowrap transition-colors"
            >
              <span className="text-slate-400">‹</span> Admin
            </button>
            <span className="h-4 w-px bg-slate-200" />
            <h1 className="text-[13px] font-semibold text-slate-800 whitespace-nowrap tracking-tight">
              Master Commission File
            </h1>
          </div>

          {/* MIDDLE — horizontally scrollable: KPIs → filters → actions → view */}
          <div className="toolbar-scroll flex-1 min-w-0">
            <div className="flex items-center gap-1.5 px-3 h-12 min-w-max">

              {/* KPI chips */}
              {([
                { label: 'Amt',    value: totalAmount, color: 'text-[var(--wgi-text)]' },
                { label: 'IFA',    value: totalIFA,    color: 'text-[var(--wgi-navy)]' },
                { label: 'Paid',   value: totalPaid,   color: 'text-[var(--cm-gain)]' },
                { label: 'Unpaid', value: totalUnpaid, color: 'text-[var(--cm-loss)]' },
              ] as const).map(({ label, value, color }) => (
                <div key={label} className="flex items-baseline gap-0.5 whitespace-nowrap">
                  <span className="text-[10px] text-gray-400">{label}</span>
                  <span className={`text-xs font-bold ${color}`}>${fmtMoney(value)}</span>
                </div>
              ))}
              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                · {rowData.length}{selectedRows.length > 0 ? ` · ${selectedRows.length} sel.` : ''} recs
              </span>
              {loading && <span className="text-[10px] text-amber-500 animate-pulse whitespace-nowrap">↻</span>}

              <span className="w-px h-4 bg-gray-200 mx-0.5" />

              {/* Dropdown filters */}
              {([
                { label: 'Status',   value: statusFilter,   setter: setStatusFilter,   field: 'status',        options: ['pending','approved','paid','cancelled','advance','reconciled'] },
                { label: 'CCY',      value: currencyFilter, setter: setCurrencyFilter,  field: 'currency',      options: uniqueCurrencies },
                { label: 'IFA',      value: ifaCodeFilter,  setter: setIfaCodeFilter,   field: 'ifa_code',      options: allIfaCodes },
                { label: 'Platform', value: platformFilter, setter: setPlatformFilter,  field: 'platform.name', options: uniquePlatforms },
              ] as const).map(({ label, value, setter, field, options }) => (
                <div key={label} className="flex items-center gap-1">
                  <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">{label}</span>
                  <select
                    value={value}
                    onChange={e => applyDropdownFilter(field, e.target.value, setter as (v: string) => void)}
                    className={`text-[11px] border rounded-md px-1.5 h-6 focus:ring-1 focus:ring-[var(--wgi-gold)] focus:outline-none transition-colors ${
                      value
                        ? 'border-[var(--wgi-gold)] bg-[#FFFBF4] text-[var(--wgi-navy)] font-semibold'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    <option value="">All</option>
                    {(options as readonly string[]).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}

              <span className="w-px h-4 bg-gray-200 mx-0.5" />

              {/* Transaction date range */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-medium text-slate-500">Date</span>
                <input type="date" value={dateFrom}
                  onChange={e => applyDateRangeFilter('transaction_date', dateFrom, setDateFrom, dateTo, setDateTo, e.target.value, undefined)}
                  className={`text-[11px] border rounded-md px-1.5 h-6 focus:ring-1 focus:ring-[var(--wgi-gold)] focus:outline-none transition-colors ${dateFrom ? 'border-[var(--wgi-gold)] bg-[#FFFBF4] text-[var(--wgi-navy)] font-semibold' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}
                />
                <span className="text-[11px] text-slate-400">–</span>
                <input type="date" value={dateTo}
                  onChange={e => applyDateRangeFilter('transaction_date', dateFrom, setDateFrom, dateTo, setDateTo, undefined, e.target.value)}
                  className={`text-[11px] border rounded-md px-1.5 h-6 focus:ring-1 focus:ring-[var(--wgi-gold)] focus:outline-none transition-colors ${dateTo ? 'border-[var(--wgi-gold)] bg-[#FFFBF4] text-[var(--wgi-navy)] font-semibold' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}
                />
                {(dateFrom || dateTo) && (
                  <button onClick={() => applyDateRangeFilter('transaction_date', dateFrom, setDateFrom, dateTo, setDateTo, '', '')}
                    className="text-[11px] text-slate-400 hover:text-slate-600 font-medium">✕</button>
                )}
              </div>

              {/* Commencement date range */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-medium text-slate-500">Comm.</span>
                <input type="date" value={commDateFrom}
                  onChange={e => applyDateRangeFilter('commencement_date', commDateFrom, setCommDateFrom, commDateTo, setCommDateTo, e.target.value, undefined)}
                  className={`text-[11px] border rounded-md px-1.5 h-6 focus:ring-1 focus:ring-[var(--wgi-gold)] focus:outline-none transition-colors ${commDateFrom ? 'border-[var(--wgi-gold)] bg-[#FFFBF4] text-[var(--wgi-navy)] font-semibold' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}
                />
                <span className="text-[11px] text-slate-400">–</span>
                <input type="date" value={commDateTo}
                  onChange={e => applyDateRangeFilter('commencement_date', commDateFrom, setCommDateFrom, commDateTo, setCommDateTo, undefined, e.target.value)}
                  className={`text-[11px] border rounded-md px-1.5 h-6 focus:ring-1 focus:ring-[var(--wgi-gold)] focus:outline-none transition-colors ${commDateTo ? 'border-[var(--wgi-gold)] bg-[#FFFBF4] text-[var(--wgi-navy)] font-semibold' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}
                />
                {(commDateFrom || commDateTo) && (
                  <button onClick={() => applyDateRangeFilter('commencement_date', commDateFrom, setCommDateFrom, commDateTo, setCommDateTo, '', '')}
                    className="text-[11px] text-slate-400 hover:text-slate-600 font-medium">✕</button>
                )}
              </div>

              <span className="w-px h-4 bg-gray-200 mx-0.5" />

              {/* Quick pills */}
              {QUICK_FILTERS.map(qf => (
                <button key={qf.label} onClick={() => toggleQuickFilter(qf)}
                  className={`h-6 px-2 text-xs rounded-full font-medium transition-colors whitespace-nowrap ${
                    activeQuickFilters.has(qf.label) ? 'bg-[var(--wgi-navy)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {qf.label}
                </button>
              ))}
              {activeFilterCount > 0 && (
                <>
                  <span className="text-[10px] text-amber-600 font-semibold whitespace-nowrap">⚡{activeFilterCount}</span>
                  <button onClick={clearAllFilters}
                    className="h-6 px-2 text-xs rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium whitespace-nowrap">
                    ✕ Clear
                  </button>
                </>
              )}

              <span className="w-px h-4 bg-gray-200 mx-0.5" />

              {/* Primary actions */}
              <button onClick={openAddModal}
                className="h-6 px-2.5 bg-[var(--wgi-navy)] text-white text-xs rounded hover:bg-[var(--wgi-navy-600)] font-medium whitespace-nowrap transition-colors">
                + New
              </button>
              {selectedRows.length > 0 && (
                <button onClick={() => { setDeleteModal(true); setDeleteConfirm(false); setDeleteTyped('') }}
                  className="h-6 px-2.5 bg-[var(--cm-status-rejected-bg)] text-[var(--cm-status-rejected-text)] text-xs rounded border border-[var(--wgi-border)] hover:border-[var(--cm-status-rejected-text)] font-medium whitespace-nowrap">
                  🗑 ({selectedRows.length})
                </button>
              )}
              {canReconcile && (
                <button onClick={() => setReconcileModal(true)}
                  className="h-6 px-2.5 bg-white text-[var(--wgi-navy)] text-xs rounded border border-[var(--wgi-border)] hover:border-[var(--wgi-navy)] font-medium whitespace-nowrap">
                  🔗 Reconcile
                </button>
              )}
              {selectedRows.length >= 2 && (
                <button
                  onClick={openMergeModal}
                  disabled={!!mergeBlockReason}
                  title={mergeBlockReason ?? 'Merge selected rows into one'}
                  className="h-6 px-2.5 bg-white text-[var(--wgi-navy)] text-xs rounded border border-[var(--wgi-border)] hover:border-[var(--wgi-navy)] font-medium whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ⊕ Merge ({selectedRows.length})
                </button>
              )}

              <span className="w-px h-4 bg-gray-200 mx-0.5" />

              {/* Selection */}
              <button onClick={selectAllFiltered}
                className="h-6 px-2.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 whitespace-nowrap">
                Sel. Filtered
              </button>
              {selectedRows.length > 0 && (
                <button onClick={selectNone}
                  className="h-6 px-2.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 whitespace-nowrap">
                  Sel. None
                </button>
              )}

              {/* Bulk status */}
              {selectedRows.length > 0 && (
                <>
                  <span className="w-px h-4 bg-gray-200 mx-0.5" />
                  <button onClick={() => bulkUpdateStatus('approved')}
                    className="h-6 px-2.5 bg-[var(--wgi-navy)] text-white text-xs rounded hover:bg-[var(--wgi-navy-600)] whitespace-nowrap">Approve</button>
                  <button onClick={bulkMarkAsPaid}
                    className="h-6 px-2.5 bg-[var(--wgi-navy)] text-white text-xs rounded hover:bg-[var(--wgi-navy-600)] whitespace-nowrap">Mark Paid</button>
                  <button onClick={() => bulkUpdateStatus('cancelled')}
                    className="h-6 px-2.5 bg-white text-[var(--cm-status-rejected-text)] text-xs rounded border border-[var(--wgi-border)] hover:border-[var(--cm-status-rejected-text)] whitespace-nowrap">Cancel</button>
                </>
              )}

              <span className="w-px h-4 bg-gray-200 mx-0.5" />

              {/* Utility */}
              <button onClick={exportToExcel}
                className="h-6 px-2.5 bg-white text-[var(--wgi-navy)] text-xs rounded border border-[var(--wgi-border)] hover:border-[var(--wgi-navy)] font-medium whitespace-nowrap">Export</button>
              <button onClick={() => loadData()} disabled={loading}
                className="h-6 px-2 bg-gray-100 text-gray-600 text-xs rounded border border-gray-300 hover:bg-gray-200 disabled:opacity-50">
                {loading ? '…' : '↻'}
              </button>
              <button onClick={() => setFullScreen(f => !f)}
                title="Full screen"
                className="h-6 px-2 bg-gray-100 text-gray-600 text-xs rounded border border-gray-300 hover:bg-gray-200">⛶</button>
              <button
                onClick={() => { const next = !showDeleted; setShowDeleted(next); filtersRestoredRef.current = false; loadData(next) }}
                className={`h-6 px-2.5 text-xs rounded border whitespace-nowrap ${
                  showDeleted ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                }`}
              >
                {showDeleted ? '👁 Hide Del.' : '👁 Deleted'}
              </button>

              <span className="w-px h-4 bg-gray-200 mx-0.5" />

              {/* Density */}
              {(['compact', 'normal', 'cozy'] as const).map(d => (
                <button key={d} onClick={() => setDensity(d)}
                  title={{ compact: 'Compact', normal: 'Normal', cozy: 'Cozy' }[d]}
                  className={`h-6 w-6 text-xs rounded border font-bold ${
                    density === d ? 'bg-[var(--wgi-navy)] text-white border-[var(--wgi-navy)]' : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {d === 'compact' ? '−' : d === 'normal' ? '○' : '+'}
                </button>
              ))}

              <span className="w-px h-4 bg-gray-200 mx-0.5" />

              {/* Column sizing */}
              <button onClick={() => gridRef.current?.api.autoSizeAllColumns()}
                className="h-6 px-2 bg-gray-100 text-gray-600 text-xs rounded border border-gray-300 hover:bg-gray-200 whitespace-nowrap">
                ⟺ Auto-fit
              </button>
              <button onClick={() => gridRef.current?.api.sizeColumnsToFit()}
                className="h-6 px-2 bg-gray-100 text-gray-600 text-xs rounded border border-gray-300 hover:bg-gray-200 whitespace-nowrap">
                ⊞ Fit
              </button>

            </div>
          </div>

          {/* RIGHT — always visible: Columns panel + Upload CSV */}
          <div className="flex items-center gap-2 px-3 flex-shrink-0 border-l border-gray-100">

            <div className="relative" ref={colPanelRef}>
              <button
                onClick={() => colPanelOpen ? setColPanelOpen(false) : openColPanel()}
                title="Show/hide and freeze columns"
                className={`h-8 px-2.5 text-xs rounded border font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  colPanelOpen
                    ? 'bg-[var(--wgi-navy)] text-white border-[var(--wgi-navy)]'
                    : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
                }`}
              >
                <span>Columns</span>
                {colSnapshot.filter(s => s.hide && s.colId !== 'rowNum').length > 0 && (
                  <span className={`text-[10px] px-1 py-0.5 rounded-full font-semibold ${colPanelOpen ? 'bg-white/25 text-white' : 'bg-[var(--wgi-bg)] text-[var(--wgi-text-muted)]'}`}>
                    {colSnapshot.filter(s => s.hide && s.colId !== 'rowNum').length}
                  </span>
                )}
                <span className="opacity-60 text-[10px]">{colPanelOpen ? '▲' : '▼'}</span>
              </button>

              {colPanelOpen && (() => {
                const snapMap = new Map(colSnapshot.map(s => [s.colId, s]))
                const groupedIds = new Set(COL_GROUPS.flatMap(g => g.ids))
                const otherIds = colSnapshot
                  .filter(s => !groupedIds.has(s.colId) && s.colId !== 'rowNum' && !s.colId.startsWith('ag-Grid'))
                  .map(s => s.colId)
                const groups = otherIds.length > 0
                  ? [...COL_GROUPS, { label: 'Other', ids: otherIds }]
                  : COL_GROUPS

                return (
                  <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-700">Columns</span>
                      <div className="flex items-center gap-2">
                        <button onClick={showAllColumns} className="text-xs text-[var(--wgi-navy)] hover:opacity-70 font-medium">Show all</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={resetColumnLayout} className="text-xs text-gray-500 hover:text-red-600">Reset</button>
                        <button onClick={() => setColPanelOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm leading-none ml-1">✕</button>
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-[420px] py-1">
                      {groups.map(group => {
                        const groupSnaps = group.ids
                          .map(id => snapMap.get(id))
                          .filter((s): s is NonNullable<typeof s> => !!s)
                        if (groupSnaps.length === 0) return null
                        return (
                          <div key={group.label}>
                            <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50 border-y border-gray-100">
                              {group.label}
                            </div>
                            {groupSnaps.map(snap => {
                              const col = gridRef.current?.api.getColumn(snap.colId)
                              const name = col?.getColDef().headerName || snap.colId
                              const isPinned = snap.pinned === 'left'
                              return (
                                <div key={snap.colId}
                                  className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors ${snap.hide ? 'opacity-50' : ''}`}
                                >
                                  <button
                                    onClick={() => toggleColVisibility(snap.colId, snap.hide)}
                                    title={snap.hide ? 'Show column' : 'Hide column'}
                                    className={`flex-shrink-0 w-8 h-4 rounded-full transition-colors ${snap.hide ? 'bg-gray-200' : 'bg-[var(--wgi-navy)]'}`}
                                  >
                                    <span className={`block w-3 h-3 rounded-full bg-white shadow transition-transform mx-0.5 ${snap.hide ? 'translate-x-0' : 'translate-x-4'}`} />
                                  </button>
                                  <span className={`flex-1 text-xs ${snap.hide ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{name}</span>
                                  <button
                                    onClick={() => toggleColPin(snap.colId, !isPinned)}
                                    title={isPinned ? 'Unfreeze' : 'Freeze left'}
                                    className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded border transition-colors ${
                                      isPinned
                                        ? 'bg-[var(--cm-status-paid-bg)] text-[var(--wgi-navy)] border-[var(--wgi-navy)] font-semibold'
                                        : 'bg-transparent text-gray-300 border-gray-200 hover:text-[var(--wgi-navy)] hover:border-[var(--wgi-navy)]'
                                    }`}
                                  >
                                    {isPinned ? '⊣ frozen' : '⊣'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400">
                      Drag columns in the grid to reorder
                    </div>
                  </div>
                )
              })()}
            </div>

            <button onClick={() => router.push('/commission/admin/upload')}
              className="h-8 px-2.5 bg-[var(--wgi-navy)] text-white text-xs rounded hover:bg-[var(--wgi-navy-600)] whitespace-nowrap font-medium transition-colors">
              Upload CSV
            </button>

          </div>
        </div>
      )}

      <main className="flex flex-col flex-1 min-h-0 px-3 pt-2 pb-2 overflow-hidden">

        {/* Feedback toast */}
        {feedback && (
          <div className="flex-shrink-0 mb-2 bg-[var(--cm-status-approved-bg)] border border-[var(--cm-status-approved-text)]/25 text-[var(--cm-status-approved-text)] px-4 py-1.5 rounded text-xs font-medium">
            {feedback}
          </div>
        )}

        {/* Bulk formula row — conditional on selection */}
        {selectedRows.length > 0 && (
          <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-3 py-1.5 mb-2 bg-white border border-gray-200 rounded-md">
            <span className="text-xs text-[var(--wgi-navy)] font-semibold whitespace-nowrap">
              Apply to {selectedRows.filter(r => !r.allocation_parent_id).length} selected:
            </span>
            <select value={formulaField} onChange={e => { setFormulaField(e.target.value); setFormulaValue('') }}
              className="text-xs border border-gray-300 rounded px-2 h-6 focus:ring-1 focus:ring-[var(--wgi-gold)] focus:outline-none bg-white">
              {FORMULA_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <input type="text" placeholder={currentHint} value={formulaValue}
              onChange={e => setFormulaValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') bulkApplyFormula() }}
              className="text-xs border border-gray-300 rounded px-2 h-6 w-44 focus:ring-1 focus:ring-[var(--wgi-gold)] focus:outline-none" />
            <button onClick={bulkApplyFormula} disabled={formulaApplying}
              className="h-6 px-3 bg-[var(--wgi-navy)] text-white text-xs rounded hover:bg-[var(--wgi-navy-600)] disabled:opacity-40 font-medium">
              {formulaApplying ? 'Applying…' : 'Apply'}
            </button>
          </div>
        )}

        {/* AG Grid + custom bottom bar */}
        <div className="flex flex-col flex-1 border border-gray-200 rounded-md overflow-hidden" style={{ minHeight: 0 }}>
          <div className="ag-theme-alpine ag-theme-commission flex-1" style={{ minHeight: 0 }}>
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(params) => String(params.data.id ?? '')}
            animateRows={true}
            rowHeight={ROW_HEIGHTS[density]}
            rowSelection={{ mode: 'multiRow', checkboxes: false, enableClickSelection: true }}
            popupParent={document.body}
            suppressPaginationPanel={true}
            onCellValueChanged={onCellValueChanged}
            onSelectionChanged={onSelectionChanged}
            onFilterChanged={onFilterChanged}
            onPaginationChanged={onPaginationChanged}
            onBodyScroll={syncHScroll}
            enableCellTextSelection={true}
            ensureDomOrder={true}
            pagination={true}
            paginationPageSize={500}
            pinnedBottomRowData={pinnedBottomRows}
            getRowStyle={(params: any): any => {
              if (params.node.rowPinned === 'bottom') {
                return params.data?._selected
                  ? { background: '#eef3f9', fontWeight: 700, borderTop: '2px solid #1B2D45' }
                  : { background: '#f1f5f9', fontWeight: 700, borderTop: '2px solid #94a3b8' }
              }
              if (params.data?._isDetailRow) return {}
              if (params.data?.is_deleted) {
                return { opacity: '0.5', background: '#fee2e2', textDecoration: 'line-through' }
              }
              if (params.data?.allocation_parent_id) {
                return { background: '#eef3f9', borderLeft: '3px solid #3D6898' } // navy tint — allocation child
              }
              if (params.data?.status === 'reconciled') {
                return { background: '#d1fae5' } // green — statement covered by advance
              }
              if (params.data?.is_advance) {
                return { background: '#FFF7ED' } // advance payment (advance token)
              }
              return undefined
            }}
            onGridReady={(e: GridReadyEvent) => {
              // Always purge any auto-generated ag-grid columns (e.g. the old checkbox selection column)
              const hideAutoGen = () => {
                const autoCols = e.api.getAllGridColumns?.()?.filter(
                  (c: any) => String(c.getColId?.() ?? '').startsWith('ag-Grid')
                )
                if (autoCols?.length) {
                  e.api.setColumnsVisible(autoCols.map((c: any) => c.getColId()), false)
                }
              }

              const saved = localStorage.getItem(COLUMN_STATE_KEY)
              let restored = false
              if (saved) {
                try {
                  const parsed = JSON.parse(saved)
                  const cleaned = parsed.filter((s: any) => !String(s.colId ?? '').startsWith('ag-Grid'))
                  if (cleaned.length !== parsed.length) {
                    localStorage.setItem(COLUMN_STATE_KEY, JSON.stringify(cleaned))
                  }
                  e.api.applyColumnState({ state: cleaned, applyOrder: true })
                  restored = true
                } catch {
                  localStorage.removeItem(COLUMN_STATE_KEY)
                }
              }

              hideAutoGen()
              if (!restored) e.api.sizeColumnsToFit()
              gridIsReadyRef.current = true
              maybeRestoreFilters()
              // Initialise custom scrollbar once the grid has painted
              setTimeout(() => {
                syncHScroll()
                // Keep thumb in sync when grid scrolls via trackpad / keyboard
                const vp = getAgHScrollViewport()
                vp?.addEventListener('scroll', syncHScroll, { passive: true })
              }, 150)
            }}
            onModelUpdated={() => { recomputeSummary(); setTimeout(syncHScroll, 50) }}
            onColumnMoved={(p) => { saveColumnState(); syncHScroll() }}
            onColumnVisible={(p) => { saveColumnState(); syncHScroll() }}
            onColumnPinned={(p) => { saveColumnState(); syncHScroll() }}
            onColumnResized={(p) => { if (p.finished) { saveColumnState(); syncHScroll() } }}
          />
          </div>{/* end ag-theme-alpine */}

          {/* ── Unified bottom bar: scrollbar + pagination ── */}
          {(() => {
            const fromRow  = pgRowCount === 0 ? 0 : pgPage * pgSize + 1
            const toRow    = Math.min((pgPage + 1) * pgSize, pgRowCount)
            const vpW = getAgHScrollViewport()?.clientWidth ?? 400
            const thumbPct = hScrollMax > 0
              ? Math.max(8, Math.min(60, (vpW / (vpW + hScrollMax)) * 100))
              : 0

            return (
              <div className="flex items-center h-8 border-t border-gray-200 bg-slate-50 flex-shrink-0 select-none">

                {/* ── Scrollbar track (left, fills remaining space) ── */}
                <div
                  ref={hScrollTrackRef}
                  onClick={onTrackClick}
                  className="flex-1 h-full flex items-center px-2 cursor-pointer relative"
                  style={{ minWidth: 0 }}
                >
                  {/* Track rail */}
                  <div className="w-full h-1.5 bg-slate-200 rounded-full relative">
                    {/* Thumb */}
                    {hScrollMax > 0 && (
                      <div
                        ref={hScrollThumbRef}
                        onMouseDown={onThumbMouseDown}
                        className="absolute top-0 h-full bg-slate-400 hover:bg-slate-500 rounded-full cursor-grab active:cursor-grabbing transition-colors"
                        style={{
                          width: `${thumbPct}%`,
                          left: `${hScrollPos * (100 - thumbPct)}%`,
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* ── Divider ── */}
                <span className="w-px h-4 bg-gray-200 flex-shrink-0" />

                {/* ── Pagination controls (right, fixed width) ── */}
                <div className="flex items-center gap-1.5 px-3 flex-shrink-0 text-[11px] text-slate-500">

                  {/* Page size */}
                  <select
                    value={pgSize}
                    onChange={e => {
                      const s = Number(e.target.value)
                      gridRef.current?.api.setGridOption('paginationPageSize', s)
                      setPgSize(s)
                    }}
                    className="border border-slate-300 rounded px-1 h-5 text-[11px] bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-[var(--wgi-gold)]"
                  >
                    {[100, 250, 500, 1000, 5000].map(s => (
                      <option key={s} value={s}>{s} / page</option>
                    ))}
                  </select>

                  <span className="text-slate-400 whitespace-nowrap">
                    {pgRowCount === 0 ? '0' : `${fromRow}–${toRow}`} of {pgRowCount}
                  </span>

                  {/* Nav buttons */}
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => gridRef.current?.api.paginationGoToFirstPage()}
                      disabled={pgPage === 0}
                      className="w-6 h-5 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold">
                      «
                    </button>
                    <button onClick={() => gridRef.current?.api.paginationGoToPreviousPage()}
                      disabled={pgPage === 0}
                      className="w-6 h-5 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold">
                      ‹
                    </button>
                    <span className="px-1.5 whitespace-nowrap">
                      {pgPage + 1} / {pgTotal || 1}
                    </span>
                    <button onClick={() => gridRef.current?.api.paginationGoToNextPage()}
                      disabled={pgPage >= pgTotal - 1}
                      className="w-6 h-5 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold">
                      ›
                    </button>
                    <button onClick={() => gridRef.current?.api.paginationGoToLastPage()}
                      disabled={pgPage >= pgTotal - 1}
                      className="w-6 h-5 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold">
                      »
                    </button>
                  </div>
                </div>

              </div>
            )
          })()}

        </div>{/* end grid+bottom-bar wrapper */}
      </main>

      {/* ── Add Record Modal ────────────────────────────────────────────────────── */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">New Commission Record</h2>
              <button onClick={() => setAddModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {addError && (
              <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{addError}</div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Transaction Date <span className="text-red-500">*</span></label>
                <input type="date" value={addForm.transaction_date}
                  onChange={e => setAddForm(f => ({ ...f, transaction_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Policy Number <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. RS02018475" value={addForm.policy_number}
                  onChange={e => setAddForm(f => ({ ...f, policy_number: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Policy Holder Name</label>
                <input type="text" value={addForm.policy_holder_name}
                  onChange={e => setAddForm(f => ({ ...f, policy_holder_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">IFA</label>
                <select value={addForm.ifa_id}
                  onChange={e => setAddForm(f => ({ ...f, ifa_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                  <option value="">— none —</option>
                  {ifaList.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Platform</label>
                <select value={addForm.platform_id}
                  onChange={e => setAddForm(f => ({ ...f, platform_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                  <option value="">— none —</option>
                  {platformList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Commission Type</label>
                <input type="text" placeholder="e.g. Initial, Renewal" value={addForm.commission_type}
                  onChange={e => setAddForm(f => ({ ...f, commission_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Amount <span className="text-red-500">*</span></label>
                <input type="number" min="0.01" step="0.01" placeholder="e.g. 1000.00" value={addForm.amount}
                  onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
                <select value={addForm.currency}
                  onChange={e => setAddForm(f => ({ ...f, currency: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                  {['USD','EUR','GBP','AED','SGD','CHF'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">IFA % (0–100)</label>
                <input type="number" min="0" max="100" step="0.01" value={addForm.ifa_percentage}
                  onChange={e => setAddForm(f => ({ ...f, ifa_percentage: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-yellow-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">IFA Susp % (0–100)</label>
                <input type="number" min="0" max="100" step="0.01" value={addForm.suspense_percentage}
                  onChange={e => setAddForm(f => ({ ...f, suspense_percentage: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-yellow-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">WGI % (0–100)</label>
                <input type="number" min="0" max="100" step="0.01" value={addForm.wgi_percentage}
                  onChange={e => setAddForm(f => ({ ...f, wgi_percentage: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-yellow-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Pdng % (0–100)</label>
                <input type="number" min="0" max="100" step="0.01" value={addForm.pending_percentage}
                  onChange={e => setAddForm(f => ({ ...f, pending_percentage: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-yellow-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <select value={addForm.status}
                  onChange={e => setAddForm(f => ({ ...f, status: e.target.value }))}
                  disabled={addForm.is_advance}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm disabled:opacity-50">
                  {['pending','approved','paid','cancelled','advance','reconciled'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {/* Advance payment toggle */}
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={addForm.is_advance}
                    onChange={e => {
                      const v = e.target.checked
                      setAddForm(f => ({
                        ...f,
                        is_advance: v,
                        status: v ? 'advance' : 'pending',
                        commission_type: v && !f.commission_type ? 'Advance' : f.commission_type,
                        notes: v && !f.notes ? 'Advance payment — awaiting official statement' : f.notes,
                      }))
                    }}
                    className="rounded border-gray-300 text-amber-600"
                  />
                  <span className="text-xs font-medium text-amber-700">
                    This is an advance payment (paid before statement arrives)
                  </span>
                </label>
                {addForm.is_advance && (
                  <p className="text-xs text-amber-600 mt-1 ml-5">
                    Record will be tagged as <strong>Advance</strong>. Once the official statement arrives, select both records and click <strong>Reconcile</strong>.
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={addForm.notes} rows={2}
                  onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
            </div>

            {/* Live preview */}
            {addForm.amount && (
              <div className="mt-4 bg-[var(--wgi-bg)] border border-[var(--wgi-border)] rounded p-3">
                <p className="text-xs font-semibold text-[var(--wgi-navy)] mb-1">Calculated Preview</p>
                <div className="grid grid-cols-3 gap-2 text-xs text-[var(--wgi-text-muted)]">
                  <span>IFA Comm: <strong>${previewIFA.toFixed(3)}</strong></span>
                  <span>IFA Susp: <strong>${previewSusp.toFixed(3)}</strong></span>
                  <span>WGI: <strong>${previewWGI.toFixed(3)}</strong></span>
                  <span>Pdng$: <strong>${previewPdng.toFixed(3)}</strong></span>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setAddModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleAddRecord} disabled={addSaving}
                className="flex-1 bg-[var(--wgi-navy)] text-white py-2 rounded text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40">
                {addSaving ? 'Saving…' : 'Add Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ───────────────────────────────────────────── */}
      <DeleteModal
        open={deleteModal}
        count={selectedRows.length}
        paidSelectedCount={paidSelectedCount}
        requireTypedConfirm={requireTypedConfirm}
        deleteEnabled={deleteEnabled}
        deleting={deleting}
        deleteTyped={deleteTyped}
        deleteConfirm={deleteConfirm}
        onTypedChange={setDeleteTyped}
        onConfirmChange={setDeleteConfirm}
        onCancel={() => setDeleteModal(false)}
        onConfirm={handleDelete}
      />

      {/* ── Allocation Breakdown Side Panel ─────────────────────────────────── */}
      {detailRecord && (() => {
        const allocations = allocationsByParent.get(detailRecord.id) ?? []
        const wgiAllocd  = allocations.filter(a => a.source_bucket === 'wgi').reduce((s, a) => s + a.percentage, 0)
        const ifaAllocd  = allocations.filter(a => a.source_bucket === 'ifa').reduce((s, a) => s + a.percentage, 0)
        const suspAllocd = allocations.filter(a => a.source_bucket === 'suspense').reduce((s, a) => s + a.percentage, 0)
        const origWgi    = detailRecord.wgi_percentage  + wgiAllocd
        const origIfa    = detailRecord.ifa_percentage  + ifaAllocd
        const origSusp   = detailRecord.suspense_percentage + suspAllocd
        const fmtP = (v: number) => `${(v * 100).toFixed(2)}%`
        const fmtA = (v: number) => `$${v.toFixed(3)}`

        return (
          <div className="fixed inset-0 z-40 flex justify-end pointer-events-none">
            {/* backdrop — only covers area, closes panel on click */}
            <div className="absolute inset-0 pointer-events-auto" onClick={() => setDetailRecord(null)} />
            <div className="relative pointer-events-auto w-full max-w-xl bg-white shadow-2xl border-l border-[var(--wgi-border)] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 bg-[var(--wgi-bg)] border-b border-[var(--wgi-border)] flex-shrink-0">
                <div>
                  <p className="text-sm font-bold text-[var(--wgi-navy)]">Allocation Breakdown</p>
                  <p className="text-xs text-[var(--wgi-text-muted)]">{detailRecord.policy_number} — {detailRecord.ifa_code} / {detailRecord.ifa_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { openAllocModalCb(detailRecord) }}
                    className="text-xs px-3 py-1.5 bg-[var(--wgi-navy)] text-white rounded font-medium hover:bg-[var(--wgi-navy-600)]"
                  >
                    + Add Allocation
                  </button>
                  <button onClick={() => setDetailRecord(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-1">✕</button>
                </div>
              </div>
              {/* Breakdown table */}
              <div className="flex-1 overflow-y-auto p-5">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--wgi-bg)] text-[var(--wgi-text-muted)]">
                      <th className="text-left px-3 py-2 border border-[var(--wgi-border)] font-semibold">Party</th>
                      <th className="text-right px-3 py-2 border border-[var(--wgi-border)] font-semibold">Uploaded %</th>
                      <th className="text-right px-3 py-2 border border-[var(--wgi-border)] font-semibold">Effective %</th>
                      <th className="text-right px-3 py-2 border border-[var(--wgi-border)] font-semibold">Effective Amt</th>
                      <th className="px-3 py-2 border border-[var(--wgi-border)]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 border border-gray-200 font-semibold">{detailRecord.ifa_code} <span className="font-normal text-gray-400">(Primary IFA)</span></td>
                      <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(origIfa)}</td>
                      <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(detailRecord.ifa_percentage)}</td>
                      <td className="px-3 py-2 border border-gray-200 text-right">{fmtA(detailRecord.ifa_amount)}</td>
                      <td className="px-3 py-2 border border-gray-200"></td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 border border-gray-200">WGI</td>
                      <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(origWgi)}</td>
                      <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(detailRecord.wgi_percentage)}</td>
                      <td className="px-3 py-2 border border-gray-200 text-right">{fmtA(detailRecord.wg_amount)}</td>
                      <td className="px-3 py-2 border border-gray-200"></td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 border border-gray-200">IFA Suspense</td>
                      <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(origSusp)}</td>
                      <td className="px-3 py-2 border border-gray-200 text-right">{fmtP(detailRecord.suspense_percentage)}</td>
                      <td className="px-3 py-2 border border-gray-200 text-right">{fmtA(detailRecord.suspense_amount)}</td>
                      <td className="px-3 py-2 border border-gray-200"></td>
                    </tr>
                    {allocations.map(alloc => (
                      <tr key={alloc.id} className="bg-amber-50">
                        <td className="px-3 py-2 border border-amber-200">
                          <span className="font-semibold text-amber-800">{alloc.secondary_ifa_code}</span>
                          {alloc.secondary_ifa_name && <span className="text-amber-700"> — {alloc.secondary_ifa_name}</span>}
                          <span className="ml-1 text-[10px] italic text-amber-500">(Secondary IFA · from {alloc.source_bucket.toUpperCase()})</span>
                        </td>
                        <td className="px-3 py-2 border border-amber-200 text-right text-gray-400">—</td>
                        <td className="px-3 py-2 border border-amber-200 text-right font-bold text-amber-700">{fmtP(alloc.percentage)}</td>
                        <td className="px-3 py-2 border border-amber-200 text-right font-bold text-amber-700">{fmtA(detailRecord.amount * alloc.percentage)}</td>
                        <td className="px-3 py-2 border border-amber-200 text-center">
                          <button
                            onClick={() => handleDeleteAllocationCb(alloc.id)}
                            disabled={deletingAllocId === alloc.id}
                            className="text-[11px] px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 disabled:opacity-40"
                          >
                            {deletingAllocId === alloc.id ? '…' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {allocations.length === 0 && (
                  <p className="text-xs text-gray-400 mt-4 text-center">No allocations yet. Click &quot;+ Add Allocation&quot; to create one.</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Add Allocation Modal ────────────────────────────────────────────── */}
      {allocModal.open && allocModal.parentRecord && (() => {
        const parent = allocModal.parentRecord
        const existingAllocs = allocationsByParent.get(parent.id) ?? []
        const bucketPct = allocForm.source_bucket === 'wgi'
          ? parent.wgi_percentage
          : allocForm.source_bucket === 'ifa'
            ? parent.ifa_percentage
            : parent.suspense_percentage
        const alreadyAllocd = existingAllocs
          .filter(a => a.source_bucket === allocForm.source_bucket)
          .reduce((s, a) => s + a.percentage, 0)
        const available = bucketPct - alreadyAllocd
        const previewPct = parseFloat(allocForm.percentage) / 100
        const previewAmt = !isNaN(previewPct) ? parent.amount * previewPct : 0

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Add Allocation</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{parent.policy_number} — {parent.ifa_code} / {parent.ifa_name}</p>
                </div>
                <button onClick={() => setAllocModal({ open: false, parentRecord: null })} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>

              {allocError && (
                <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{allocError}</div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Source Bucket</label>
                  <select
                    value={allocForm.source_bucket}
                    onChange={e => setAllocForm(f => ({ ...f, source_bucket: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  >
                    <option value="wgi">WGI ({(parent.wgi_percentage * 100).toFixed(2)}% → ${parent.wg_amount?.toFixed(3)})</option>
                    <option value="ifa">IFA ({(parent.ifa_percentage * 100).toFixed(2)}% → ${parent.ifa_amount?.toFixed(3)})</option>
                    <option value="suspense">Suspense ({(parent.suspense_percentage * 100).toFixed(2)}% → ${parent.suspense_amount?.toFixed(3)})</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Available from {allocForm.source_bucket.toUpperCase()}: <strong className="text-[var(--wgi-navy)]">{(available * 100).toFixed(2)}%</strong>
                    {' '}= <strong className="text-[var(--wgi-navy)]">${(parent.amount * available).toFixed(3)}</strong>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Percentage to redirect (0–100) <span className="text-red-500">*</span></label>
                  <input
                    type="number" min="0.01" max="100" step="0.01"
                    placeholder={`Max ${(available * 100).toFixed(2)}`}
                    value={allocForm.percentage}
                    onChange={e => setAllocForm(f => ({ ...f, percentage: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  />
                  {allocForm.percentage && !isNaN(previewPct) && previewPct > 0 && (
                    <p className="text-xs text-[var(--wgi-navy)] mt-1">
                      = <strong>${previewAmt.toFixed(3)}</strong> redirected to secondary IFA
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Secondary IFA <span className="text-red-500">*</span></label>
                  <select
                    value={allocForm.secondary_ifa_id}
                    onChange={e => setAllocForm(f => ({ ...f, secondary_ifa_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  >
                    <option value="">— select IFA —</option>
                    {ifaList.filter(i => i.code !== parent.ifa_code).map(i => (
                      <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Producer works under supervising IFA"
                    value={allocForm.notes}
                    onChange={e => setAllocForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={() => setAllocModal({ open: false, parentRecord: null })}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleSubmitAllocation} disabled={allocSaving}
                  className="flex-1 bg-[var(--wgi-navy)] text-white py-2 rounded text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40">
                  {allocSaving ? 'Creating…' : 'Create Allocation'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Merge Selected Rows Modal ──────────────────────────────────────────── */}
      {mergeModal && mergePreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900">Merge selected rows</h2>
            <p className="text-sm text-gray-600">
              Only the rows you selected will be combined. Other rows for this policy are unchanged.
            </p>

            <div className="overflow-x-auto border border-gray-200 rounded">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left">Primary</th>
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-left">Type</th>
                    <th className="px-2 py-2 text-right">Received</th>
                    <th className="px-2 py-2 text-right">IFA Comm</th>
                    <th className="px-2 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedRows.map(r => (
                    <tr key={r.id} className={r.id === mergeSurvivorId ? 'bg-[#eef3f9]' : ''}>
                      <td className="px-2 py-2">
                        <input
                          type="radio"
                          name="merge-survivor"
                          checked={mergeSurvivorId === r.id}
                          onChange={() => setMergeSurvivorId(r.id)}
                        />
                      </td>
                      <td className="px-2 py-2">{r.transaction_date}</td>
                      <td className="px-2 py-2">{r.commission_type ?? '—'}</td>
                      <td className="px-2 py-2 text-right">${fmtMoney(r.amount)}</td>
                      <td className="px-2 py-2 text-right">${fmtMoney(r.ifa_amount)}</td>
                      <td className="px-2 py-2">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-[var(--wgi-bg)] border border-[var(--wgi-border)] rounded p-4 text-sm grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><span className="text-gray-500 block text-xs">Received</span><strong>${fmtMoney(mergePreview.amount)}</strong></div>
              <div><span className="text-gray-500 block text-xs">Expect</span><strong>${fmtMoney(mergePreview.variable_amount)}</strong></div>
              <div><span className="text-gray-500 block text-xs">Gross</span><strong>${fmtMoney(mergePreview.gross)}</strong></div>
              <div><span className="text-gray-500 block text-xs">IFA Comm</span><strong className="text-[var(--wgi-navy)]">${fmtMoney(mergePreview.ifa_amount)}</strong></div>
              <div><span className="text-gray-500 block text-xs">Paid</span><strong>${fmtMoney(mergePreview.paid)}</strong></div>
              <div><span className="text-gray-500 block text-xs">Unpaid</span><strong className="text-[var(--cm-loss)]">${fmtMoney(mergePreview.unpaid)}</strong></div>
              <div><span className="text-gray-500 block text-xs">Status</span><strong>{mergePreview.status}</strong></div>
              <div><span className="text-gray-500 block text-xs">Trans date</span><strong>{mergePreview.transaction_date}</strong></div>
            </div>

            <p className="text-xs text-gray-500">
              Policy <strong>{selectedRows[0]?.policy_number}</strong> · IFA <strong>{selectedRows[0]?.ifa_code}</strong> · {selectedRows.length} rows → 1 row
            </p>

            {mergeError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{mergeError}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setMergeModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleConfirmMerge} disabled={merging || !mergeSurvivorId}
                className="flex-1 bg-[var(--wgi-navy)] text-white py-2 rounded text-sm font-medium hover:bg-[var(--wgi-navy-600)] disabled:opacity-40">
                {merging ? 'Merging…' : `Merge ${selectedRows.length} rows`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reconcile Confirmation Modal ─────────────────────────────────────── */}
      <ReconcileModal
        open={reconcileModal}
        selectedRows={selectedRows}
        reconciling={reconciling}
        onCancel={() => setReconcileModal(false)}
        onConfirm={handleReconcile}
      />
    </div>
  )
}
