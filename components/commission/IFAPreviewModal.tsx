'use client'

import { useState, useEffect, useCallback } from 'react'
import { getAuthHeaders } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import * as XLSX from 'xlsx'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Balance {
  current_balance:   number
  suspended_balance: number
  total_earned:      number
  total_paid:        number
}

interface CommissionRecord {
  id: string
  transaction_date: string
  commission_type: string | null
  ifa_amount: number
  currency: string
  status: string
  policy_number: string
  policy_holder_name: string | null
  ifa_code: string | null
  paid: number
  ape: number | null
  ifa_notes: string | null
  platform: { name: string } | null
}

interface APEPeriod { period: string; ape: number }

interface PaymentBatch {
  id: string
  total_amount: number
  currency: string
  payment_reference: string | null
  payment_date: string
  transaction_count: number
}

type ActiveTab = 'transactions' | 'payments' | 'ape'

interface Props {
  ifaCode: string
  ifaName: string
  onClose: () => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function IFAPreviewModal({ ifaCode, ifaName, onClose }: Props) {
  const [balance, setBalance]   = useState<Balance | null>(null)
  const [balLoading, setBalLoading] = useState(true)

  const [activeTab, setActiveTab] = useState<ActiveTab>('transactions')

  // Transactions
  const [transactions, setTransactions] = useState<CommissionRecord[]>([])
  const [txLoading, setTxLoading]       = useState(false)
  const [filterFrom, setFilterFrom]     = useState('')
  const [filterTo, setFilterTo]         = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType]     = useState('')
  const [filterPolicy, setFilterPolicy] = useState('')

  // Payment history
  const [payments, setPayments]     = useState<PaymentBatch[]>([])
  const [payLoading, setPayLoading] = useState(false)

  // APE summary
  const [apePeriods, setApePeriods]  = useState<APEPeriod[]>([])
  const [apeTotal,   setApeTotal]    = useState(0)
  const [apeLoading, setApeLoading]  = useState(false)
  const [apeYear,    setApeYear]     = useState(new Date().getFullYear().toString())
  const [apeGroupBy, setApeGroupBy]  = useState<'month' | 'quarter' | 'year'>('month')

  const [exporting, setExporting] = useState(false)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Fetch balance ────────────────────────────────────────────────────────────

  useEffect(() => {
    setBalLoading(true)
    getAuthHeaders().then(headers =>
      fetch(`/api/commission/admin/ifa-preview/balance?ifa_code=${encodeURIComponent(ifaCode)}`, { headers })
    ).then(res => res.ok ? res.json() : null).then(data => {
      if (data) setBalance(data)
    }).catch(() => {}).finally(() => {
      setBalLoading(false)
    })
  }, [ifaCode])

  // ── Fetch transactions ───────────────────────────────────────────────────────

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true)
    try {
      const params = new URLSearchParams({ ifa_code: ifaCode })
      if (filterFrom)   params.set('from', filterFrom)
      if (filterTo)     params.set('to', filterTo)
      if (filterStatus) params.set('status', filterStatus)
      if (filterType)   params.set('commission_type', filterType)
      if (filterPolicy) params.set('policy_number', filterPolicy)

      const headers = await getAuthHeaders()
      const res = await fetch(`/api/commission/admin/ifa-preview/transactions?${params}`, { headers })
      if (res.ok) {
        const { transactions: data } = await res.json()
        setTransactions(data ?? [])
      }
    } finally {
      setTxLoading(false)
    }
  }, [ifaCode, filterFrom, filterTo, filterStatus, filterType, filterPolicy])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  // ── Fetch payment history ────────────────────────────────────────────────────

  const fetchPayments = useCallback(async () => {
    setPayLoading(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/commission/admin/ifa-preview/payments?ifa_code=${encodeURIComponent(ifaCode)}`, { headers })
      if (res.ok) {
        const { payments: data } = await res.json()
        setPayments(data ?? [])
      }
    } finally {
      setPayLoading(false)
    }
  }, [ifaCode])

  useEffect(() => {
    if (activeTab === 'payments') fetchPayments()
  }, [activeTab, fetchPayments])

  // ── Fetch APE ────────────────────────────────────────────────────────────────

  const fetchAPE = useCallback(async () => {
    setApeLoading(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(
        `/api/commission/admin/ifa-preview/ape?ifa_code=${encodeURIComponent(ifaCode)}&year=${apeYear}&group_by=${apeGroupBy}`,
        { headers }
      )
      if (res.ok) {
        const { total, periods } = await res.json()
        setApeTotal(total ?? 0)
        setApePeriods(periods ?? [])
      }
    } finally {
      setApeLoading(false)
    }
  }, [ifaCode, apeYear, apeGroupBy])

  useEffect(() => {
    if (activeTab === 'ape') fetchAPE()
  }, [activeTab, fetchAPE])

  // ── Export ───────────────────────────────────────────────────────────────────

  const handleExport = () => {
    setExporting(true)
    const rows = transactions.map(t => ({
      Date:         t.transaction_date,
      Platform:     t.platform?.name ?? '',
      Policy:       t.policy_number,
      Holder:       t.policy_holder_name ?? '',
      Type:         t.commission_type ?? '',
      'IFA Amount': t.ifa_amount,
      APE:          t.ape ?? '',
      Currency:     t.currency,
      Status:       t.status,
      'IFA Notes':  t.ifa_notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
    XLSX.writeFile(wb, `ifa_transactions_${ifaCode}_${new Date().toISOString().split('T')[0]}.xlsx`)
    setExporting(false)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      approved: 'bg-green-100 text-green-800',
      paid:     'bg-blue-100 text-blue-800',
      pending:  'bg-yellow-100 text-yellow-800',
      cancelled:'bg-red-100 text-red-700',
    }
    return map[status] ?? 'bg-gray-100 text-gray-600'
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col flex-1 overflow-hidden"
        style={{
          margin: '24px',
          borderRadius: '14px',
          background: 'var(--wgi-bg)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >

        {/* Admin preview banner */}
        <div style={{
          background: 'var(--wgi-navy)',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: '14px 14px 0 0',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              background: '#F59E0B',
              color: '#1a1a1a',
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Admin Preview
            </span>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px', fontWeight: 500 }}>
              Viewing as <strong>{ifaName}</strong>
              <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', marginLeft: '8px' }}>{ifaCode}</span>
            </span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
              — Read-only view
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              padding: '5px 14px',
              borderRadius: '7px',
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>

        {/* IFA portal content (scrollable) */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Balance cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { label: 'Available Balance', value: balance?.current_balance   ?? 0, accent: '#059669', note: 'Approved, awaiting payment' },
              { label: 'Suspended',         value: balance?.suspended_balance ?? 0, accent: '#D97706', note: 'Pending approval' },
              { label: 'Total Earned',      value: balance?.total_earned      ?? 0, accent: 'var(--wgi-accent)', note: 'All time' },
              { label: 'Total Paid',        value: balance?.total_paid        ?? 0, accent: '#7C3AED', note: 'Already transferred' },
            ] as const).map(({ label, value, accent, note }) => (
              <div
                key={label}
                className="wgi-card"
                style={{ padding: '18px 20px', borderTop: `4px solid ${accent}` }}
              >
                <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--wgi-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
                {balLoading
                  ? <div style={{ height: '32px', background: '#E5E7EB', borderRadius: '6px', marginTop: '6px', width: '80%' }} />
                  : <p style={{ fontSize: '24px', fontWeight: 700, color: accent, marginTop: '6px', letterSpacing: '-0.02em' }}>{formatCurrency(value, 'USD')}</p>
                }
                <p style={{ fontSize: '12px', color: 'var(--wgi-text-light)', marginTop: '4px' }}>{note}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="wgi-card">
            <div style={{ borderBottom: '1px solid var(--wgi-border)', paddingLeft: '16px' }}>
              <nav style={{ display: 'flex' }}>
                {([['transactions', 'Transactions'], ['payments', 'Payment History'], ['ape', 'APE Summary']] as [ActiveTab, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    style={{
                      padding: '14px 20px',
                      fontSize: '13px',
                      fontWeight: activeTab === key ? 600 : 500,
                      borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                      borderBottom: activeTab === key ? '2px solid var(--wgi-navy)' : '2px solid transparent',
                      marginBottom: '-1px',
                      color: activeTab === key ? 'var(--wgi-navy)' : 'var(--wgi-text-muted)',
                      background: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'color 0.15s',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            {/* TRANSACTIONS TAB */}
            {activeTab === 'transactions' && (
              <div>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--wgi-border)', background: '#F8FAFC', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                  {[
                    { label: 'From',   node: <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={filterInputStyle} /> },
                    { label: 'To',     node: <input type="date" value={filterTo}   onChange={e => setFilterTo(e.target.value)}   style={filterInputStyle} /> },
                    { label: 'Status', node: (
                      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={filterInputStyle}>
                        <option value="">All</option>
                        <option value="approved">Approved</option>
                        <option value="paid">Paid</option>
                      </select>
                    )},
                    { label: 'Type',   node: <input type="text" placeholder="e.g. Initial" value={filterType}   onChange={e => setFilterType(e.target.value)}   style={{ ...filterInputStyle, width: '120px' }} /> },
                    { label: 'Policy', node: <input type="text" placeholder="Search…"      value={filterPolicy} onChange={e => setFilterPolicy(e.target.value)} style={{ ...filterInputStyle, width: '110px' }} /> },
                  ].map(({ label, node }) => (
                    <div key={label}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--wgi-text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
                      {node}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={fetchTransactions} disabled={txLoading} style={filterBtnStyle('primary', txLoading)}>
                      {txLoading ? '…' : 'Apply'}
                    </button>
                    <button onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterStatus(''); setFilterType(''); setFilterPolicy('') }} style={filterBtnStyle('secondary', false)}>
                      Clear
                    </button>
                    <button onClick={handleExport} disabled={exporting || transactions.length === 0} style={filterBtnStyle('export', exporting || transactions.length === 0)}>
                      {exporting ? 'Exporting…' : 'Export Excel'}
                    </button>
                  </div>
                </div>

                <div style={{ padding: '8px 16px', fontSize: '12px', color: 'var(--wgi-text-light)' }}>
                  {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                </div>

                {transactions.length === 0 ? (
                  <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--wgi-text-light)', fontSize: '14px' }}>
                    {txLoading ? 'Loading…' : 'No transactions match the current filters.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--wgi-border)' }}>
                          {['Date', 'Platform', 'Policy', 'Holder', 'Type', 'Amount', 'APE', 'Status', 'Notes'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--wgi-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((t, i) => (
                          <tr key={t.id} style={{ borderBottom: '1px solid var(--wgi-border)', background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                            <td style={{ padding: '10px 14px', color: 'var(--wgi-text-muted)', whiteSpace: 'nowrap' }}>
                              {t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--wgi-text-muted)' }}>{t.platform?.name ?? '—'}</td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px' }}>{t.policy_number}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--wgi-text-muted)' }}>{t.policy_holder_name ?? '—'}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--wgi-text-muted)', fontSize: '12px' }}>{t.commission_type || '—'}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--wgi-text)', whiteSpace: 'nowrap' }}>
                              {formatCurrency(t.ifa_amount, t.currency || 'USD')}
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--wgi-text)', whiteSpace: 'nowrap' }}>
                              {t.ape != null ? formatCurrency(t.ape, t.currency || 'USD') : <span style={{ color: 'var(--wgi-text-light)' }}>—</span>}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(t.status)}`}>
                                {t.status}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--wgi-text-muted)', fontSize: '12px', maxWidth: '200px' }}>
                              {t.ifa_notes ? (
                                <span title={t.ifa_notes} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {t.ifa_notes}
                                </span>
                              ) : <span style={{ color: 'var(--wgi-text-light)' }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* APE TAB */}
            {activeTab === 'ape' && (
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                  {[
                    { label: 'Year', node: (
                      <select value={apeYear} onChange={e => setApeYear(e.target.value)} style={filterInputStyle}>
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    )},
                    { label: 'Group by', node: (
                      <select value={apeGroupBy} onChange={e => setApeGroupBy(e.target.value as any)} style={filterInputStyle}>
                        <option value="month">Month</option>
                        <option value="quarter">Quarter</option>
                        <option value="year">Year</option>
                      </select>
                    )},
                  ].map(({ label, node }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{ fontSize: '13px', color: 'var(--wgi-text-muted)', fontWeight: 500 }}>{label}:</label>
                      {node}
                    </div>
                  ))}
                </div>

                {apeLoading ? (
                  <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--wgi-text-light)', fontSize: '14px' }}>Loading…</div>
                ) : apePeriods.length === 0 ? (
                  <div style={{ padding: '48px 0', textAlign: 'center' }}>
                    <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--wgi-text-muted)' }}>No APE data for {apeYear}</p>
                    <p style={{ fontSize: '13px', color: 'var(--wgi-text-light)', marginTop: '6px' }}>APE values are entered by WGI staff and will appear here once recorded.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'inline-block', background: 'var(--wgi-navy)', borderRadius: '12px', padding: '16px 24px', marginBottom: '24px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total APE — {apeYear}</p>
                      <p style={{ fontSize: '26px', fontWeight: 700, color: '#fff', marginTop: '4px', letterSpacing: '-0.02em' }}>{formatCurrency(apeTotal, 'USD')}</p>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', border: '1px solid var(--wgi-border)', borderRadius: '10px', overflow: 'hidden' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--wgi-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Period</th>
                          <th style={{ padding: '10px 20px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: 'var(--wgi-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>APE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apePeriods.map(({ period, ape }, i) => (
                          <tr key={period} style={{ borderTop: '1px solid var(--wgi-border)', background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                            <td style={{ padding: '10px 20px', fontFamily: 'monospace', fontSize: '13px' }}>{period}</td>
                            <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 600, color: 'var(--wgi-text)' }}>{formatCurrency(ape, 'USD')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--wgi-border)', background: '#F8FAFC' }}>
                          <td style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 600, color: 'var(--wgi-text)' }}>Total</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: 'var(--wgi-navy)' }}>{formatCurrency(apeTotal, 'USD')}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </>
                )}
              </div>
            )}

            {/* PAYMENT HISTORY TAB */}
            {activeTab === 'payments' && (
              <div>
                {payLoading ? (
                  <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--wgi-text-light)', fontSize: '14px' }}>Loading…</div>
                ) : payments.length === 0 ? (
                  <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--wgi-text-light)', fontSize: '14px' }}>No payments recorded yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--wgi-border)' }}>
                          {['Payment Date', 'Amount', 'Transactions', 'Reference'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--wgi-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p, i) => (
                          <tr key={p.id} style={{ borderBottom: '1px solid var(--wgi-border)', background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                            <td style={{ padding: '10px 14px', color: 'var(--wgi-text-muted)' }}>{p.payment_date ? new Date(p.payment_date).toLocaleDateString() : '—'}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#059669' }}>{formatCurrency(p.total_amount, p.currency || 'USD')}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--wgi-text-muted)' }}>{p.transaction_count}</td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--wgi-text-muted)' }}>{p.payment_reference ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Style helpers ──────────────────────────────────────────────────────────────

const filterInputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--wgi-border)',
  borderRadius: '7px',
  fontSize: '13px',
  color: 'var(--wgi-text)',
  background: '#fff',
  fontFamily: 'inherit',
  outline: 'none',
}

const filterBtnStyle = (variant: 'primary' | 'secondary' | 'export', disabled: boolean): React.CSSProperties => {
  const base: React.CSSProperties = {
    padding: '6px 14px', borderRadius: '7px', fontSize: '13px',
    fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', border: 'none', opacity: disabled ? 0.45 : 1,
  }
  if (variant === 'primary') return { ...base, background: 'var(--wgi-navy)', color: '#fff' }
  if (variant === 'export')  return { ...base, background: '#059669', color: '#fff' }
  return { ...base, background: '#fff', border: '1px solid var(--wgi-border)', color: 'var(--wgi-text)' }
}
