'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import type {
  ColDef,
  CellValueChangedEvent,
  GridReadyEvent,
  ValueFormatterParams,
  ValueParserParams,
  CellClassParams,
} from 'ag-grid-community'
import * as XLSX from 'xlsx'

ModuleRegistry.registerModules([AllCommunityModule])

// ── Types ──────────────────────────────────────────────────────────────────────

interface CommissionRecord {
  id: string
  transaction_date: string
  policy_number: string
  policy_holder_name: string | null
  ifa_code: string | null
  ifa_name: string | null
  commission_type: string | null
  commission_type_code: string | null
  amount: number
  variable_amount: number
  currency: string
  ifa_percentage: number
  suspense_percentage: number
  wgi_percentage: number
  ifa_amount: number
  suspense_amount: number
  wg_amount: number
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
  platform: { name: string } | null
  upload_batch: { filename: string } | null
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
  status: string
  notes: string
  is_advance: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FILTER_STORAGE_KEY  = 'wgi_master_file_filters'
const COLUMN_STATE_KEY    = 'wgi_master_file_columns'

// Column panel groups — maps colIds to labelled sections in the dropdown
const COL_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Identity',   ids: ['transaction_date', 'commencement_date', 'policy_number', 'policy_holder_name', 'ifa_code', 'ifa_name'] },
  { label: 'Commission', ids: ['commission_type', 'amount', 'variable_amount', 'adjusted', 'currency', 'platform_payment_pct', 'ape', 'ape_wgi', 'ifa_percentage', 'ifa_amount', 'suspense_percentage', 'suspense_amount', 'wgi_percentage', 'wg_amount'] },
  { label: 'Payment',    ids: ['due_wg', 'paid', 'unpaid', 'status'] },
  { label: 'Metadata',   ids: ['rate', 'notes', 'ifa_notes', 'platform.name', 'upload_batch.filename'] },
]

const FORMULA_FIELDS = [
  { value: 'ifa_percentage',      label: 'IFA %',         hint: '0–100  e.g. 12.5' },
  { value: 'suspense_percentage', label: 'IFA Susp %',    hint: '0–100  e.g. 5' },
  { value: 'wgi_percentage',      label: 'WGI %',         hint: '0–100  e.g. 2.5' },
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
  status: 'pending',
  notes: '',
  is_advance: false,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtMoney = (n: number): string => {
  const [int, dec] = Math.abs(n).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (n < 0 ? '-' : '') + grouped + '.' + dec
}

const fmtNum = (p: ValueFormatterParams): string =>
  p.value != null ? fmtMoney(Number(p.value)) : '0.00'

const fmtPct = (p: ValueFormatterParams): string =>
  (p.value != null && Number(p.value) !== 0) ? `${(Number(p.value) * 100).toFixed(4)}%` : '—'

const parsePct = (p: ValueParserParams): number => {
  const v = parseFloat(String(p.newValue).replace('%', ''))
  return isNaN(v) ? (p.oldValue as number) : v / 100
}

const parseAmt = (p: ValueParserParams): number | null => {
  const str = String(p.newValue ?? '').replace(/[$,]/g, '').trim()
  if (str === '') return null
  const v = parseFloat(str)
  return isNaN(v) ? (p.oldValue as number) : v
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Format ISO date string (YYYY-MM-DD) as dd/mm/yy
const fmtDate = (p: ValueFormatterParams): string => {
  if (p.node?.rowPinned || !p.value) return ''
  const [y, m, d] = String(p.value).split('-')
  if (!y || !m || !d) return p.value
  return `${d}/${m}/${y.slice(2)}`
}

// Mirror of the server-side normalizer in process-upload/route.ts
function normalizeCommissionType(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  if (/\binitial\b/.test(s) || s === 'init' || s === 'first year') return 'Initial'
  if (/\btrail\b/.test(s) || /\btrailing\b/.test(s) || s === 'renewal trail') return 'Trail'
  if (/\brenewal\b/.test(s) || s === 'renew' || s === 'subsequent') return 'Renewal'
  if (/\bother\b/.test(s) || s === 'misc' || s === 'miscellaneous' || s === 'override') return 'Other'
  return raw.slice(0, 255) || null
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
    let fAmt = 0, fIFA = 0, fSusp = 0, fWG = 0, fPaid = 0, fUnpaid = 0
    let fAdj = 0, fVar = 0, fApe = 0, fApeWgi = 0, fDueWg = 0
    api.forEachNodeAfterFilter(node => {
      if (node.rowPinned || !node.data) return
      const r = node.data as CommissionRecord
      filteredCount++
      fAmt    += r.amount          ?? 0
      fIFA    += r.ifa_amount      ?? 0
      fSusp   += r.suspense_amount ?? 0
      fWG     += r.wg_amount       ?? 0
      fPaid   += r.paid            ?? 0
      fUnpaid += r.unpaid          ?? 0
      fVar    += r.variable_amount ?? 0
      fAdj    += (r.amount ?? 0) + (r.variable_amount ?? 0)
      fApe    += r.ape             ?? 0
      fApeWgi += r.ape_wgi         ?? 0
      fDueWg  += r.due_wg          ?? 0
    })

    const allRow: Record<string, unknown> = {
      _summary: true, _selected: false,
      _label: `ALL FILTERED: ${filteredCount} rows`,
      amount: round2(fAmt), ifa_amount: round2(fIFA),
      suspense_amount: round2(fSusp), wg_amount: round2(fWG),
      paid: round2(fPaid), unpaid: round2(fUnpaid),
      variable_amount: round2(fVar), adjusted: round2(fAdj), ape: round2(fApe),
      ape_wgi: round2(fApeWgi), due_wg: round2(fDueWg),
    }

    const sel = api.getSelectedRows() as CommissionRecord[]
    if (sel.length > 0) {
      let sAmt = 0, sIFA = 0, sSusp = 0, sWG = 0, sPaid = 0, sUnpaid = 0
      let sAdj = 0, sVar = 0, sApe = 0, sApeWgi = 0, sDueWg = 0
      sel.forEach(r => {
        sAmt    += r.amount          ?? 0
        sIFA    += r.ifa_amount      ?? 0
        sSusp   += r.suspense_amount ?? 0
        sWG     += r.wg_amount       ?? 0
        sPaid   += r.paid            ?? 0
        sUnpaid += r.unpaid          ?? 0
        sVar    += r.variable_amount ?? 0
        sAdj    += (r.amount ?? 0) + (r.variable_amount ?? 0)
        sApe    += r.ape             ?? 0
        sApeWgi += r.ape_wgi         ?? 0
        sDueWg  += r.due_wg          ?? 0
      })
      const selRow: Record<string, unknown> = {
        _summary: true, _selected: true,
        _label: `SELECTED: ${sel.length} rows`,
        amount: round2(sAmt), ifa_amount: round2(sIFA),
        suspense_amount: round2(sSusp), wg_amount: round2(sWG),
        paid: round2(sPaid), unpaid: round2(sUnpaid),
        variable_amount: round2(sVar), adjusted: round2(sAdj), ape: round2(sApe),
        ape_wgi: round2(sApeWgi), due_wg: round2(sDueWg),
      }
      setPinnedBottomRows([allRow, selRow])
    } else {
      setPinnedBottomRows([allRow])
    }
  }

  // ── Column Definitions ────────────────────────────────────────────────────────
  const columnDefs = useMemo<ColDef[]>(() => {
    const yellowCell = { backgroundColor: '#fef3c7' }

    return [
      // Row number — clean row header, click to select (Excel-style)
      {
        colId: 'rowNum',
        headerName: '#',
        width: 48, minWidth: 48, maxWidth: 48,
        pinned: 'left',
        sortable: false, filter: false, editable: false,
        suppressMovable: true, resizable: false,
        cellStyle: (p: any): any => ({
          background: p.node?.isSelected?.() ? '#dbeafe' : '#f1f5f9',
          color: p.node?.isSelected?.() ? '#1d4ed8' : '#94a3b8',
          fontSize: '11px',
          fontWeight: 500,
          textAlign: 'center',
          cursor: 'pointer',
          borderRight: '1px solid #e2e8f0',
        }),
        valueGetter: (p: any) => p.node?.rowPinned ? '' : (p.node?.rowIndex ?? 0) + 1,
      },
      // Date
      {
        headerName: 'Trans Date', field: 'transaction_date',
        width: 120, sort: 'desc', pinned: 'left',
        filter: 'agDateColumnFilter',
        filterParams: {
          comparator: (filterDate: Date, cellValue: string) => {
            if (!cellValue) return -1
            const [y, m, d] = cellValue.split('-').map(Number)
            const cell = new Date(y, m - 1, d)
            if (cell < filterDate) return -1
            if (cell > filterDate) return 1
            return 0
          },
        },
        valueFormatter: fmtDate,
      },
      // Commencement date — sourced from CSV (RL360 and similar); null for platforms that don't supply it
      {
        headerName: 'Issue Date', field: 'commencement_date',
        width: 120, hide: true,
        filter: 'agDateColumnFilter',
        filterParams: {
          comparator: (filterDate: Date, cellValue: string) => {
            if (!cellValue) return -1
            const [y, m, d] = cellValue.split('-').map(Number)
            const cell = new Date(y, m - 1, d)
            if (cell < filterDate) return -1
            if (cell > filterDate) return 1
            return 0
          },
        },
        valueFormatter: fmtDate,
        cellStyle: { color: '#6b7280' } as Record<string, string | number>,
      },
      // Policy — shows summary label when pinned
      {
        headerName: 'Policy', field: 'policy_number',
        width: 130, filter: 'agTextColumnFilter', pinned: 'left',
        valueFormatter: (p: ValueFormatterParams) =>
          p.node?.rowPinned === 'bottom' ? ((p.data as any)?._label ?? '') : p.value,
      },
      { headerName: 'Holder',    field: 'policy_holder_name', width: 180, filter: 'agTextColumnFilter' },
      { headerName: 'IFA Code',  field: 'ifa_code',           width: 100, filter: 'agTextColumnFilter' },
      { headerName: 'IFA Name',  field: 'ifa_name',           width: 150, filter: 'agTextColumnFilter' },
      { headerName: 'Type',      field: 'commission_type',    width: 130, filter: 'agTextColumnFilter' },
      {
        headerName: 'Received', field: 'amount',
        width: 120, filter: 'agNumberColumnFilter', type: 'numericColumn', valueFormatter: fmtNum,
        cellStyle: { fontWeight: 'bold' } as Record<string, string | number>,
      },
      {
        headerName: 'Expect', field: 'variable_amount',
        width: 110, editable: true, type: 'numericColumn', filter: 'agNumberColumnFilter',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
        valueFormatter: (p: ValueFormatterParams) => {
          const v = p.value as number
          if (v == null) return ''
          if (p.node?.rowPinned) return fmtMoney(Number(v))
          if (v === 0) return '—'
          const m = fmtMoney(Math.abs(Number(v)))
          return v > 0 ? '+' + m : '-' + m
        },
        valueParser: parseAmt,
      },
      {
        colId: 'adjusted',
        headerName: 'Gross',
        width: 120, type: 'numericColumn', filter: 'agNumberColumnFilter',
        valueGetter: (p: any) => {
          if (p.node?.rowPinned) return p.data?.adjusted ?? null
          const amt = Number(p.data?.amount ?? 0)
          const adj = Number(p.data?.variable_amount ?? 0)
          return amt + adj
        },
        valueFormatter: (p: ValueFormatterParams) => p.value != null ? fmtMoney(Number(p.value)) : '',
        cellStyle: { fontWeight: 'bold', color: '#1d4ed8' } as Record<string, string | number>,
      },
      {
        headerName: 'CCY', field: 'currency',
        width: 70, filter: 'agTextColumnFilter',
        cellStyle: { color: '#6b7280', fontWeight: 500, textAlign: 'center' } as Record<string, string | number>,
      },
      {
        headerName: 'IA Rate', field: 'platform_payment_pct',
        width: 90, type: 'numericColumn', filter: 'agNumberColumnFilter',
        valueFormatter: (p: ValueFormatterParams) =>
          p.node?.rowPinned || p.value == null ? '' : String(parseFloat(Number(p.value).toFixed(4))),
        cellStyle: { color: '#6b7280' } as Record<string, string | number>,
      },
      // APE IFA — manually entered Annual Premium Equivalent (IFA-facing)
      {
        headerName: 'APE IFA', field: 'ape',
        width: 110, editable: true, type: 'numericColumn', filter: 'agNumberColumnFilter',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
        valueFormatter: (p: ValueFormatterParams) =>
          p.value != null ? fmtMoney(Number(p.value)) : (p.node?.rowPinned ? '' : '—'),
        valueParser: parseAmt,
      },
      // APE WGI — manually entered Annual Premium Equivalent (WGI internal)
      {
        headerName: 'APE WGI', field: 'ape_wgi',
        width: 110, editable: true, type: 'numericColumn', filter: 'agNumberColumnFilter',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
        valueFormatter: (p: ValueFormatterParams) =>
          p.value != null ? fmtMoney(Number(p.value)) : (p.node?.rowPinned ? '' : '—'),
        valueParser: parseAmt,
      },
      // Editable percentage columns
      {
        headerName: 'IFA %', field: 'ifa_percentage',
        width: 95, editable: true, type: 'numericColumn',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
        valueFormatter: (p: ValueFormatterParams) => p.node?.rowPinned ? '' : fmtPct(p),
        valueParser: parsePct,
      },
      {
        headerName: 'IFA Comm', field: 'ifa_amount',
        width: 130, type: 'numericColumn',
        cellStyle: { fontWeight: 'bold' } as Record<string, string | number>,
        valueFormatter: fmtNum,
      },
      {
        headerName: 'IFA Susp %', field: 'suspense_percentage',
        width: 110, editable: true, type: 'numericColumn',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
        valueFormatter: (p: ValueFormatterParams) => p.node?.rowPinned ? '' : fmtPct(p),
        valueParser: parsePct,
      },
      {
        headerName: 'IFA Susp', field: 'suspense_amount',
        width: 130, type: 'numericColumn', valueFormatter: fmtNum,
      },
      {
        headerName: 'WGI %', field: 'wgi_percentage',
        width: 95, editable: true, type: 'numericColumn',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
        valueFormatter: (p: ValueFormatterParams) => p.node?.rowPinned ? '' : fmtPct(p),
        valueParser: parsePct,
      },
      {
        headerName: 'WG O/R', field: 'wg_amount',
        width: 120, type: 'numericColumn', valueFormatter: fmtNum,
      },
      {
        headerName: 'DUE WG', field: 'due_wg',
        width: 110, editable: true, type: 'numericColumn',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
        valueFormatter: (p: ValueFormatterParams) =>
          p.value != null ? fmtMoney(Number(p.value)) : '',
        valueParser: parseAmt,
      },
      {
        headerName: 'Paid', field: 'paid',
        width: 110, editable: true, type: 'numericColumn',
        valueFormatter: fmtNum,
        valueParser: (p: ValueParserParams): number => {
          const str = String(p.newValue ?? '').replace(/[$,]/g, '').trim()
          if (str === '') return 0
          const v = parseFloat(str)
          return isNaN(v) ? (p.oldValue as number ?? 0) : v
        },
      },
      {
        headerName: 'Unpaid', field: 'unpaid',
        width: 110, type: 'numericColumn',
        valueFormatter: fmtNum,
        cellStyle: (p: CellClassParams) =>
          (p.value ?? 0) > 0
            ? { color: '#dc2626', fontWeight: 'bold' }
            : { color: '#16a34a', fontWeight: 'normal' },
      },
      {
        headerName: 'Status', field: 'status',
        width: 120, editable: true,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: ['pending', 'approved', 'paid', 'cancelled'] },
        cellStyle: (p: CellClassParams) => {
          if (p.node?.rowPinned) return null
          const colors: Record<string, string> = {
            pending: '#f59e0b', approved: '#3b82f6', paid: '#10b981', cancelled: '#ef4444',
          }
          const c = colors[p.value as string] ?? '#6b7280'
          return { backgroundColor: `${c}20`, color: c, fontWeight: 'bold' }
        },
      },
      {
        headerName: 'Rate', field: 'rate',
        width: 100, editable: true, type: 'numericColumn', filter: 'agNumberColumnFilter',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
        valueFormatter: (p: ValueFormatterParams) =>
          p.value != null ? Number(p.value).toFixed(4) : (p.node?.rowPinned ? '' : '—'),
        valueParser: parseAmt,
      },
      { headerName: 'Notes', field: 'notes', width: 200, editable: true, filter: 'agTextColumnFilter', cellStyle: { backgroundColor: '#fef9c3', borderLeft: '2px solid #facc15' } as Record<string, string | number> },
      { headerName: 'IFA Notes', field: 'ifa_notes', width: 200, editable: true, filter: 'agTextColumnFilter', cellStyle: { backgroundColor: '#fef9c3', borderLeft: '2px solid #facc15' } as Record<string, string | number> },
      { headerName: 'Platform', field: 'platform.name', width: 120, filter: 'agTextColumnFilter' },
      {
        headerName: 'Source File', field: 'upload_batch.filename',
        width: 160, filter: 'agTextColumnFilter',
        valueFormatter: (p: ValueFormatterParams) => {
          if (p.node?.rowPinned) return ''
          const r = p.data as CommissionRecord | undefined
          return r?.upload_batch?.filename ?? '— manual entry —'
        },
      },
    ]
  }, [])

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true, resizable: true, filter: true,
  }), [])

  // ── Cell edit ────────────────────────────────────────────────────────────────
  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef } = event
    const field = colDef.field as string
    const editableFields = ['ifa_percentage', 'suspense_percentage', 'wgi_percentage', 'variable_amount', 'ape', 'ape_wgi', 'due_wg', 'paid', 'status', 'rate', 'notes', 'ifa_notes']
    if (!editableFields.includes(field)) return

    const updatePayload: Record<string, unknown> = { [field]: data[field], updated_at: new Date().toISOString() }

    try {
      const { error } = await supabase
        .from('commission_records')
        .update(updatePayload)
        .eq('id', data.id)
      if (error) throw error
      const { data: fresh, error: fe } = await supabase
        .from('commission_records')
        .select('*, platform:platforms(name), upload_batch:csv_upload_batches(filename)')
        .eq('id', data.id).single()
      if (!fe && fresh) {
        gridRef.current?.api.applyTransaction({ update: [fresh as unknown as CommissionRecord] })
        recomputeSummary()
      } else {
        // Re-fetch failed (e.g. RLS not yet warmed up) — full reload keeps grid consistent
        await loadData()
      }
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`)
      await loadData()
    }
  }, []) // eslint-disable-line

  // ── Selection ────────────────────────────────────────────────────────────────
  const onSelectionChanged = useCallback(() => {
    setSelectedRows(gridRef.current?.api.getSelectedRows() ?? [])
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
      if (!node.rowPinned) node.setSelected(true)
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
    const { error } = await supabase
      .from('commission_records')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .in('id', selectedRows.map(r => r.id))
    if (error) { alert(`Failed: ${error.message}`); return }
    showFeedback(`${selectedRows.length} record(s) set to "${newStatus}".`)
    await loadData()
  }

  async function bulkMarkAsPaid() {
    if (!selectedRows.length) { alert('Select rows first'); return }
    if (!confirm(`Mark ${selectedRows.length} record(s) as paid?`)) return
    const paidAt = new Date().toISOString()
    const results = await Promise.all(
      selectedRows.map(row =>
        supabase.from('commission_records')
          .update({ paid: row.ifa_amount, status: 'paid', paid_at: paidAt, updated_at: paidAt })
          .eq('id', row.id)
      )
    )
    const failed = results.filter(r => r.error).length
    if (failed > 0) { alert(`${failed} row(s) failed`) } else { showFeedback(`${selectedRows.length} record(s) marked paid.`) }
    await loadData()
  }

  async function bulkApplyFormula() {
    if (!selectedRows.length) { alert('Select rows first'); return }
    if (!formulaValue.trim()) { alert('Enter a value'); return }
    let dbValue: string | number = formulaValue.trim()
    if (['ifa_percentage', 'suspense_percentage', 'wgi_percentage'].includes(formulaField)) {
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
    if (!confirm(`Apply "${label} = ${formulaValue}" to ${selectedRows.length} record(s)?`)) return
    setFormulaApplying(true)
    const { error } = await supabase
      .from('commission_records')
      .update({ [formulaField]: dbValue, updated_at: new Date().toISOString() })
      .in('id', selectedRows.map(r => r.id))
    setFormulaApplying(false)
    if (error) { alert(`Failed: ${error.message}`); return }
    showFeedback(`Applied "${label} = ${formulaValue}" to ${selectedRows.length} record(s).`)
    setFormulaValue('')
    await loadData()
  }

  // ── Add record ────────────────────────────────────────────────────────────────
  async function openAddModal() {
    setAddForm({ ...defaultAddForm, transaction_date: new Date().toISOString().split('T')[0] })
    setAddError('')
    setAddModal(true)
    if (ifaList.length === 0) {
      const { data } = await supabase.from('ifas').select('id, code, name').neq('role', 'admin').order('name')
      setIfaList((data ?? []) as IFAEntry[])
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
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('commission_records').insert({
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
      status:              addForm.is_advance ? 'advance' : addForm.status,
      is_advance:          addForm.is_advance,
      notes:               addForm.notes.trim() || null,
      created_by:          user?.id ?? null,
    })
    setAddSaving(false)
    if (error) { setAddError(error.message); return }
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
      const r = node.data as CommissionRecord
      rows.push({
        'Trans Date': r.transaction_date, 'Issue Date': r.commencement_date ?? '', Policy: r.policy_number, Holder: r.policy_holder_name ?? '',
        'IFA Code': r.ifa_code ?? '', 'IFA Name': r.ifa_name ?? '', Type: r.commission_type ?? '',
        Received: r.amount, Expect: r.variable_amount ?? 0, Gross: (r.amount ?? 0) + (r.variable_amount ?? 0),
        Currency: r.currency, 'IA Rate': r.platform_payment_pct ?? '', 'APE IFA': r.ape ?? '', 'APE WGI': r.ape_wgi ?? '',
        'IFA %': r.ifa_percentage, 'IFA Comm': r.ifa_amount,
        'IFA Susp %': r.suspense_percentage, 'IFA Susp': r.suspense_amount,
        'WGI %': r.wgi_percentage, 'WG O/R': r.wg_amount, 'DUE WG': r.due_wg ?? '',
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
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
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const totalAmount = rowData.reduce((s, r) => s + (r.amount ?? 0), 0)
  const totalIFA    = rowData.reduce((s, r) => s + (r.ifa_amount ?? 0), 0)
  const totalPaid   = rowData.reduce((s, r) => s + (r.paid ?? 0), 0)
  const totalUnpaid = rowData.reduce((s, r) => s + (r.unpaid ?? 0), 0)
  const currentHint = FORMULA_FIELDS.find(f => f.value === formulaField)?.hint ?? ''

  const prevAmt   = parseFloat(addForm.amount || '0')
  const previewIFA  = round2(prevAmt * parseFloat(addForm.ifa_percentage  || '0') / 100)
  const previewSusp = round2(prevAmt * parseFloat(addForm.suspense_percentage || '0') / 100)
  const previewWGI  = round2(prevAmt * parseFloat(addForm.wgi_percentage  || '0') / 100)

  const paidSelectedCount      = selectedRows.filter(r => r.status === 'paid').length
  const requireTypedConfirm    = selectedRows.length > 100
  const deleteEnabled          = requireTypedConfirm ? deleteTyped === 'DELETE' : deleteConfirm
  const canReconcile           = selectedRows.length === 2 && selectedRows.some(r => r.is_advance) && selectedRows.some(r => !r.is_advance) && selectedRows.every(r => !r.linked_record_id)

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={`bg-gray-50 flex flex-col ${fullScreen ? 'fixed inset-0 z-50' : 'h-[calc(100vh-4rem)] overflow-hidden'}`}>

      {/* ── Single merged toolbar strip ── */}
      {!fullScreen && (
        <div className="bg-white border-b border-gray-200 flex-shrink-0 flex items-stretch h-12">

          {/* LEFT — always visible: back link + title */}
          <div className="flex items-center gap-2.5 px-4 flex-shrink-0 border-r border-gray-200 bg-slate-50">
            <button
              onClick={() => router.push('/commission/admin')}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 font-medium whitespace-nowrap transition-colors"
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
                { label: 'Amt',    value: totalAmount, color: 'text-gray-800' },
                { label: 'IFA',    value: totalIFA,    color: 'text-blue-600' },
                { label: 'Paid',   value: totalPaid,   color: 'text-green-700' },
                { label: 'Unpaid', value: totalUnpaid, color: 'text-red-600' },
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
                    className={`text-[11px] border rounded-md px-1.5 h-6 focus:ring-1 focus:ring-blue-400 focus:outline-none transition-colors ${
                      value
                        ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold'
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
                  className={`text-[11px] border rounded-md px-1.5 h-6 focus:ring-1 focus:ring-blue-400 focus:outline-none transition-colors ${dateFrom ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}
                />
                <span className="text-[11px] text-slate-400">–</span>
                <input type="date" value={dateTo}
                  onChange={e => applyDateRangeFilter('transaction_date', dateFrom, setDateFrom, dateTo, setDateTo, undefined, e.target.value)}
                  className={`text-[11px] border rounded-md px-1.5 h-6 focus:ring-1 focus:ring-blue-400 focus:outline-none transition-colors ${dateTo ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}
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
                  className={`text-[11px] border rounded-md px-1.5 h-6 focus:ring-1 focus:ring-blue-400 focus:outline-none transition-colors ${commDateFrom ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}
                />
                <span className="text-[11px] text-slate-400">–</span>
                <input type="date" value={commDateTo}
                  onChange={e => applyDateRangeFilter('commencement_date', commDateFrom, setCommDateFrom, commDateTo, setCommDateTo, undefined, e.target.value)}
                  className={`text-[11px] border rounded-md px-1.5 h-6 focus:ring-1 focus:ring-blue-400 focus:outline-none transition-colors ${commDateTo ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}
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
                    activeQuickFilters.has(qf.label) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                className="h-6 px-2.5 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700 font-medium whitespace-nowrap transition-colors">
                + New
              </button>
              {selectedRows.length > 0 && (
                <button onClick={() => { setDeleteModal(true); setDeleteConfirm(false); setDeleteTyped('') }}
                  className="h-6 px-2.5 bg-red-50 text-red-700 text-xs rounded border border-red-200 hover:bg-red-100 font-medium whitespace-nowrap">
                  🗑 ({selectedRows.length})
                </button>
              )}
              {canReconcile && (
                <button onClick={() => setReconcileModal(true)}
                  className="h-6 px-2.5 bg-amber-50 text-amber-800 text-xs rounded border border-amber-300 hover:bg-amber-100 font-medium whitespace-nowrap">
                  🔗 Reconcile
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
                    className="h-6 px-2.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 whitespace-nowrap">Approve</button>
                  <button onClick={bulkMarkAsPaid}
                    className="h-6 px-2.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 whitespace-nowrap">Mark Paid</button>
                  <button onClick={() => bulkUpdateStatus('cancelled')}
                    className="h-6 px-2.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 whitespace-nowrap">Cancel</button>
                </>
              )}

              <span className="w-px h-4 bg-gray-200 mx-0.5" />

              {/* Utility */}
              <button onClick={exportToExcel}
                className="h-6 px-2.5 bg-gray-700 text-white text-xs rounded hover:bg-gray-800 whitespace-nowrap">Export</button>
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
                    density === d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
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
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
                }`}
              >
                <span>Columns</span>
                {colSnapshot.filter(s => s.hide && s.colId !== 'rowNum').length > 0 && (
                  <span className={`text-[10px] px-1 py-0.5 rounded-full font-semibold ${colPanelOpen ? 'bg-indigo-400 text-white' : 'bg-red-100 text-red-600'}`}>
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
                        <button onClick={showAllColumns} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Show all</button>
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
                                    className={`flex-shrink-0 w-8 h-4 rounded-full transition-colors ${snap.hide ? 'bg-gray-200' : 'bg-indigo-500'}`}
                                  >
                                    <span className={`block w-3 h-3 rounded-full bg-white shadow transition-transform mx-0.5 ${snap.hide ? 'translate-x-0' : 'translate-x-4'}`} />
                                  </button>
                                  <span className={`flex-1 text-xs ${snap.hide ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{name}</span>
                                  <button
                                    onClick={() => toggleColPin(snap.colId, !isPinned)}
                                    title={isPinned ? 'Unfreeze' : 'Freeze left'}
                                    className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded border transition-colors ${
                                      isPinned
                                        ? 'bg-blue-100 text-blue-700 border-blue-300 font-semibold'
                                        : 'bg-transparent text-gray-300 border-gray-200 hover:text-blue-500 hover:border-blue-300'
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
              className="h-8 px-2.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 whitespace-nowrap font-medium transition-colors">
              Upload CSV
            </button>

          </div>
        </div>
      )}

      <main className="flex flex-col flex-1 min-h-0 px-3 pt-2 pb-2 overflow-hidden">

        {/* Feedback toast */}
        {feedback && (
          <div className="flex-shrink-0 mb-2 bg-green-50 border border-green-200 text-green-800 px-4 py-1.5 rounded text-xs font-medium">
            {feedback}
          </div>
        )}

        {/* Bulk formula row — conditional on selection */}
        {selectedRows.length > 0 && (
          <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-3 py-1.5 mb-2 bg-white border border-gray-200 rounded-md">
            <span className="text-xs text-purple-700 font-medium whitespace-nowrap">
              Apply to {selectedRows.length} selected:
            </span>
            <select value={formulaField} onChange={e => { setFormulaField(e.target.value); setFormulaValue('') }}
              className="text-xs border border-gray-300 rounded px-2 h-6 focus:ring-1 focus:ring-purple-400 focus:outline-none bg-white">
              {FORMULA_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <input type="text" placeholder={currentHint} value={formulaValue}
              onChange={e => setFormulaValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') bulkApplyFormula() }}
              className="text-xs border border-gray-300 rounded px-2 h-6 w-44 focus:ring-1 focus:ring-purple-400 focus:outline-none" />
            <button onClick={bulkApplyFormula} disabled={formulaApplying}
              className="h-6 px-3 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-40 font-medium">
              {formulaApplying ? 'Applying…' : 'Apply'}
            </button>
          </div>
        )}

        {/* AG Grid + custom bottom bar */}
        <div className="flex flex-col flex-1 border border-gray-200 rounded-md overflow-hidden" style={{ minHeight: 0 }}>
          <div className="ag-theme-alpine flex-1" style={{ minHeight: 0 }}>
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
                  ? { background: '#dbeafe', fontWeight: 700, borderTop: '2px solid #3b82f6' }
                  : { background: '#f1f5f9', fontWeight: 700, borderTop: '2px solid #94a3b8' }
              }
              if (params.data?.is_deleted) {
                return { opacity: '0.5', background: '#fee2e2', textDecoration: 'line-through' }
              }
              if (params.data?.status === 'reconciled') {
                return { background: '#d1fae5' } // green — statement covered by advance
              }
              if (params.data?.is_advance) {
                return { background: '#fef3c7' } // amber — advance payment
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
                      gridRef.current?.api.paginationSetPageSize(s)
                      setPgSize(s)
                    }}
                    className="border border-slate-300 rounded px-1 h-5 text-[11px] bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1">Calculated Preview</p>
                <div className="grid grid-cols-3 gap-2 text-xs text-blue-800">
                  <span>IFA Comm: <strong>${previewIFA.toFixed(2)}</strong></span>
                  <span>IFA Susp: <strong>${previewSusp.toFixed(2)}</strong></span>
                  <span>WGI: <strong>${previewWGI.toFixed(2)}</strong></span>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setAddModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleAddRecord} disabled={addSaving}
                className="flex-1 bg-emerald-600 text-white py-2 rounded text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
                {addSaving ? 'Saving…' : 'Add Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ───────────────────────────────────────────── */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Delete {selectedRows.length} Record{selectedRows.length !== 1 ? 's' : ''}?
            </h2>

            {paidSelectedCount > 0 && (
              <div className="bg-amber-50 border border-amber-300 text-amber-800 px-3 py-2 rounded text-sm">
                ⚠️ <strong>{paidSelectedCount}</strong> of the selected record{paidSelectedCount !== 1 ? 's are' : ' is'} already <strong>paid</strong>.
                Deleting will not reverse any payment batches.
              </div>
            )}

            <p className="text-sm text-gray-600">
              Records will be <strong>soft-deleted</strong> — hidden from normal view but retained in the database.
              Use <em>Show Deleted</em> to view them later.
            </p>

            {requireTypedConfirm ? (
              <div>
                <p className="text-sm text-red-700 font-medium mb-2">
                  Deleting {selectedRows.length} records. Type <strong>DELETE</strong> to confirm:
                </p>
                <input type="text" value={deleteTyped}
                  onChange={e => setDeleteTyped(e.target.value)}
                  placeholder="Type DELETE"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono" />
              </div>
            ) : (
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.checked)} className="mt-0.5" />
                <span className="text-sm text-gray-700">I understand this cannot be undone from the interface.</span>
              </label>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setDeleteModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting || !deleteEnabled}
                className="flex-1 bg-red-600 text-white py-2 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-40">
                {deleting ? 'Deleting…' : `Delete ${selectedRows.length} Record${selectedRows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reconcile Confirmation Modal ─────────────────────────────────────── */}
      {reconcileModal && (() => {
        const advRow = selectedRows.find(r => r.is_advance)
        const stmRow = selectedRows.find(r => !r.is_advance)
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Reconcile Advance with Statement</h2>

              <div className="space-y-3 text-sm">
                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Advance Payment</p>
                  <p className="font-medium text-gray-900">{advRow?.policy_number} — {advRow?.ifa_name}</p>
                  <p className="text-gray-500">${advRow?.ifa_amount?.toFixed(2)} {advRow?.currency} · {advRow?.transaction_date}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <p className="text-xs font-semibold text-green-700 mb-1">Statement Entry (will be marked reconciled)</p>
                  <p className="font-medium text-gray-900">{stmRow?.policy_number} — {stmRow?.ifa_name}</p>
                  <p className="text-gray-500">${stmRow?.ifa_amount?.toFixed(2)} {stmRow?.currency} · {stmRow?.transaction_date}</p>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-600 space-y-1">
                <p>After reconciliation:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Statement entry → <strong>reconciled</strong>, paid = IFA amount (unpaid = $0)</li>
                  <li>Both records remain visible and linked to each other</li>
                  <li>Advance record is unchanged</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setReconcileModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleReconcile} disabled={reconciling}
                  className="flex-1 bg-amber-600 text-white py-2 rounded text-sm font-medium hover:bg-amber-700 disabled:opacity-40">
                  {reconciling ? 'Reconciling…' : 'Confirm Reconcile'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
