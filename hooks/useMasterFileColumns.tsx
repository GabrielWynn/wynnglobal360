import { useMemo } from 'react'
import type { MutableRefObject } from 'react'
import type { ColDef, ValueFormatterParams, ValueParserParams, CellClassParams } from 'ag-grid-community'
import { fmtMoney, fmtNum, fmtPct, parsePct, parseAmt, fmtDate } from '@/lib/commission-format'

/**
 * Column definitions for the master-file ag-grid, extracted from the page.
 *
 * The expand-column renderer closes over four component bindings (the
 * allocations map ref, the open-detail ref, the detail setter, and the
 * add-allocation callback). They are passed in so behavior is identical to the
 * in-component `useMemo([])` it replaced. Typed loosely (the grid params are
 * `any` throughout) to avoid coupling this module to the page's interfaces.
 */
interface UseMasterFileColumnsArgs {
  allocationsByParentRef: MutableRefObject<any>
  detailRecordRef: MutableRefObject<any>
  setDetailRecord: (record: any) => void
  openAllocModalCb: (record: any) => void
  openDueWgAllocModalCb: (record: any) => void
  toggleDueWgStatusCb: (record: any) => void
  unlinkDueWgCb: (record: any) => void
}

export function useMasterFileColumns({
  allocationsByParentRef,
  detailRecordRef,
  setDetailRecord,
  openAllocModalCb,
  openDueWgAllocModalCb,
  toggleDueWgStatusCb,
  unlinkDueWgCb,
}: UseMasterFileColumnsArgs): ColDef[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo<ColDef[]>(() => {
    const yellowCell = { backgroundColor: '#FAF5EA' }  // editable-cell affordance (gold wash)

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
          background: p.node?.isSelected?.() ? '#eef3f9' : '#f1f5f9',
          color: p.node?.isSelected?.() ? '#1B2D45' : '#94a3b8',
          fontSize: '11px',
          fontWeight: 500,
          textAlign: 'center',
          cursor: 'pointer',
          borderRight: '1px solid #e2e8f0',
        }),
        valueGetter: (p: any) => p.node?.rowPinned ? '' : (p.node?.rowIndex ?? 0) + 1,
      },
      // Expand chevron — only visible for parent records that have allocations
      {
        colId: 'expand',
        headerName: '',
        width: 30, minWidth: 30, maxWidth: 30,
        pinned: 'left',
        sortable: false, filter: false, editable: false,
        suppressMovable: true, resizable: false,
        cellStyle: { padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        cellRenderer: (p: any) => {
          const data = p.data
          if (!data || data.allocation_parent_id || p.node?.rowPinned) return null
          const hasAlloc = allocationsByParentRef.current.has(data.id)
          if (hasAlloc) {
            const isOpen = detailRecordRef.current?.id === data.id
            return (
              <button
                onClick={(e) => { e.stopPropagation(); setDetailRecord(isOpen ? null : data) }}
                title={isOpen ? 'Close breakdown panel' : 'View allocation breakdown'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#1B2D45', fontWeight: 'bold', padding: '0 2px', lineHeight: 1 }}
              >
                {isOpen ? '▼' : '▶'}
              </button>
            )
          }
          return (
            <button
              onClick={(e) => { e.stopPropagation(); openAllocModalCb(data) }}
              title="Add commission allocation"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8', fontWeight: 'bold', padding: '0 2px', lineHeight: 1 }}
            >
              +
            </button>
          )
        },
        valueGetter: () => null,
      },
      // Date
      {
        headerName: 'Trans Date', field: 'transaction_date',
        width: 120, sort: 'desc', pinned: 'left',
        editable: true, cellEditor: 'agDateStringCellEditor',
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
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
      },
      // Commencement date — sourced from CSV (RL360 and similar); null for platforms that don't supply it
      {
        headerName: 'Issue Date', field: 'commencement_date',
        width: 120, hide: true,
        editable: true, cellEditor: 'agDateStringCellEditor',
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
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
      },
      // Policy — shows summary label when pinned.
      // Read-only: the exact-match key for the Merge feature and IFA statement
      // reconciliation; also feeds the Unmapped Azure re-lookup tool.
      {
        headerName: 'Policy', field: 'policy_number',
        width: 130, filter: 'agTextColumnFilter', pinned: 'left',
        valueFormatter: (p: ValueFormatterParams) =>
          p.node?.rowPinned === 'bottom' ? ((p.data as any)?._label ?? '') : p.value,
      },
      {
        headerName: 'Holder', field: 'policy_holder_name',
        width: 180, editable: true, filter: 'agTextColumnFilter',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
      },
      // Read-only: dashboard/report balances group by ifa_code (not ifa_id, which
      // stays untouched), so editing this splits the record's balance from its
      // actual payment routing instead of reassigning it.
      { headerName: 'IFA Code', field: 'ifa_code', width: 100, filter: 'agTextColumnFilter' },
      { headerName: 'IFA Name', field: 'ifa_name', width: 150, filter: 'agTextColumnFilter' },
      {
        headerName: 'Type', field: 'commission_type',
        width: 130, editable: true, filter: 'agTextColumnFilter',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
      },
      {
        headerName: 'Type2', field: 'type2',
        headerTooltip: 'ISIN for Structured Notes',
        width: 130, editable: true, filter: 'agTextColumnFilter',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
      },
      {
        headerName: 'Received', field: 'amount',
        width: 120, editable: true, filter: 'agNumberColumnFilter', type: 'numericColumn', valueFormatter: fmtNum,
        valueParser: parseAmt,
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : { ...yellowCell, fontWeight: 'bold' },
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
        cellStyle: { fontWeight: 'bold', color: '#1B2D45' } as Record<string, string | number>,
      },
      {
        headerName: 'CCY', field: 'currency',
        width: 70, editable: true, filter: 'agTextColumnFilter',
        cellStyle: (p: CellClassParams) =>
          p.node.rowPinned ? null : { ...yellowCell, fontWeight: 500, textAlign: 'center' },
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
        width: 130, type: 'numericColumn',
        cellStyle: { fontWeight: 'bold' } as Record<string, string | number>,
        valueFormatter: fmtNum,
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
        width: 120, type: 'numericColumn',
        cellStyle: { fontWeight: 'bold' } as Record<string, string | number>,
        valueFormatter: fmtNum,
      },
      {
        headerName: 'Pdng %', field: 'pending_percentage',
        width: 95, editable: true, type: 'numericColumn',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
        valueFormatter: (p: ValueFormatterParams) => p.node?.rowPinned ? '' : fmtPct(p),
        valueParser: parsePct,
      },
      {
        headerName: 'Pdng$', field: 'pending_amount',
        width: 120, type: 'numericColumn',
        cellStyle: { fontWeight: 'bold' } as Record<string, string | number>,
        valueFormatter: fmtNum,
      },
      {
        headerName: 'DUE WG', field: 'due_wg',
        width: 110, editable: true, type: 'numericColumn',
        cellStyle: (p: CellClassParams) => p.node.rowPinned ? null : yellowCell,
        valueFormatter: (p: ValueFormatterParams) =>
          p.value != null ? fmtMoney(Number(p.value)) : '',
        valueParser: parseAmt,
      },
      // WG Alloc — links this row's Due WG amount to the Agent Adjustments
      // lump-sum payment it belongs to. Unallocated + due_wg set: an "Allocate"
      // button opens the picker. Allocated: a Pending/Paid pill (click to toggle
      // — the only thing that reduces the adjustment's outstanding Due) plus a
      // small unlink control. A separate column rather than embedded in the
      // DUE WG cell itself, same reasoning as the 'expand' allocation column above.
      {
        colId: 'due_wg_alloc',
        headerName: 'WG Alloc',
        width: 120,
        sortable: false, filter: false, editable: false,
        suppressMovable: true, resizable: false,
        cellStyle: { display: 'flex', alignItems: 'center' } as Record<string, string | number>,
        cellRenderer: (p: any) => {
          const data = p.data
          if (!data || p.node?.rowPinned || data.is_agent_adjustment) return null
          const dueWg = data.due_wg
          if (dueWg == null || Number(dueWg) === 0) return null

          if (!data.agent_adjustment_id) {
            return (
              <button
                onClick={(e) => { e.stopPropagation(); openDueWgAllocModalCb(data) }}
                title="Allocate this Due WG amount to an Agent Adjustment"
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                  background: 'none', border: '1px solid var(--wgi-navy)', color: 'var(--wgi-navy)',
                  borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                }}
              >
                Allocate
              </button>
            )
          }

          const isPaid = data.due_wg_status === 'paid'
          const bg   = isPaid ? 'var(--cm-status-paid-bg)'   : 'var(--cm-status-pending-bg)'
          const text = isPaid ? 'var(--cm-status-paid-text)' : 'var(--cm-status-pending-text)'
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={(e) => { e.stopPropagation(); toggleDueWgStatusCb(data) }}
                title={isPaid ? 'Confirmed paid — click to revert to pending' : 'Linked, awaiting confirmation — click to confirm paid'}
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                  background: bg, color: text, border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                }}
              >
                {isPaid ? 'Paid' : 'Pending'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); unlinkDueWgCb(data) }}
                title="Remove this allocation"
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </span>
          )
        },
        valueGetter: () => null,
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
            ? { color: '#CC0000', fontWeight: 'bold' }
            : { color: '#00873E', fontWeight: 'normal' },
      },
      {
        headerName: 'Status', field: 'status',
        width: 120, editable: true,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: ['pending', 'approved', 'paid', 'cancelled'] },
        cellStyle: (p: CellClassParams) => {
          if (p.node?.rowPinned) return null
          // Commission status palette (DESIGN-COMMISSION.md --cm-status-*).
          const tokens: Record<string, { bg: string; text: string }> = {
            pending:    { bg: 'var(--cm-status-pending-bg)',   text: 'var(--cm-status-pending-text)' },
            approved:   { bg: 'var(--cm-status-approved-bg)',  text: 'var(--cm-status-approved-text)' },
            paid:       { bg: 'var(--cm-status-paid-bg)',      text: 'var(--cm-status-paid-text)' },
            cancelled:  { bg: 'var(--cm-status-rejected-bg)',  text: 'var(--cm-status-rejected-text)' },
            advance:    { bg: 'var(--cm-status-advance-bg)',   text: 'var(--cm-status-advance-text)' },
            reconciled: { bg: 'var(--cm-status-suspended-bg)', text: 'var(--cm-status-suspended-text)' },
          }
          const t = tokens[p.value as string] ?? { bg: '#F1F5F9', text: '#64748B' }
          return { backgroundColor: t.bg, color: t.text, fontWeight: 'bold' }
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
      {
        headerName: 'Notes', field: 'notes', width: 200, editable: true, filter: 'agTextColumnFilter',
        cellEditor: 'agLargeTextCellEditor', cellEditorPopup: true,
        cellEditorParams: { maxLength: 2000, rows: 6, cols: 50 },
        wrapText: true, autoHeight: true,
        cellStyle: (p: CellClassParams): any => p.node.rowPinned
          ? null
          : { backgroundColor: '#FAF5EA', borderLeft: '2px solid #C8A96E', whiteSpace: 'pre-wrap', lineHeight: '1.4' },
      },
      {
        headerName: 'IFA Notes', field: 'ifa_notes', width: 200, editable: true, filter: 'agTextColumnFilter',
        cellEditor: 'agLargeTextCellEditor', cellEditorPopup: true,
        cellEditorParams: { maxLength: 2000, rows: 6, cols: 50 },
        wrapText: true, autoHeight: true,
        cellStyle: (p: CellClassParams): any => p.node.rowPinned
          ? null
          : { backgroundColor: '#FAF5EA', borderLeft: '2px solid #C8A96E', whiteSpace: 'pre-wrap', lineHeight: '1.4' },
      },
      { headerName: 'Platform', field: 'platform.name', width: 120, filter: 'agTextColumnFilter' },
      {
        headerName: 'Source File', field: 'upload_batch.filename',
        width: 160, filter: 'agTextColumnFilter',
        valueFormatter: (p: ValueFormatterParams) => {
          if (p.node?.rowPinned) return ''
          const r = p.data as { upload_batch?: { filename?: string } | null } | undefined
          return r?.upload_batch?.filename ?? '— manual entry —'
        },
      },
    ]
  }, [])
}
