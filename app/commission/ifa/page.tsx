'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getIFADetails, getAuthHeaders, linkIFAOnLogin } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import * as XLSX from 'xlsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Balance {
  current_balance:  number
  suspended_balance: number
  total_earned:     number
  total_paid:       number
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function IFAPortal() {
  const router = useRouter()
  const [ifa, setIFA] = useState<any>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState<ActiveTab>('transactions')

  // Transactions
  const [transactions, setTransactions]   = useState<CommissionRecord[]>([])
  const [txLoading, setTxLoading]         = useState(false)
  const [filterFrom, setFilterFrom]       = useState('')
  const [filterTo, setFilterTo]           = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [filterType, setFilterType]       = useState('')
  const [filterPolicy, setFilterPolicy]   = useState('')

  // Payment history
  const [payments, setPayments]     = useState<PaymentBatch[]>([])
  const [payLoading, setPayLoading] = useState(false)

  // APE summary
  const [apePeriods,  setApePeriods]  = useState<APEPeriod[]>([])
  const [apeTotal,    setApeTotal]    = useState<number>(0)
  const [apeLoading,  setApeLoading]  = useState(false)
  const [apeYear,     setApeYear]     = useState(new Date().getFullYear().toString())
  const [apeGroupBy,  setApeGroupBy]  = useState<'month' | 'quarter' | 'year'>('month')

  const [exporting, setExporting] = useState(false)

  // ── Auth + initial load ──────────────────────────────────────────────────────

  useEffect(() => {
    // linkIFAOnLogin is idempotent — runs on every load to catch OAuth sign-ins
    // (Microsoft Azure) that bypass the login page and land directly here.
    linkIFAOnLogin().then(() => getIFADetails()).then(async ifaDetails => {
      if (!ifaDetails) { router.push('/login'); return }
      if (ifaDetails.role === 'admin') { router.push('/commission/admin'); return }
      setIFA(ifaDetails)

      // Fetch balance via service-role API (avoids RLS + ifa_id mismatch issues)
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/commission/ifa/balance', { headers: authHeaders })
      if (res.ok) {
        const data = await res.json()
        setBalance(data)
      }

      setLoading(false)
    })
  }, [router])

  // ── Fetch transactions via service-role API ──────────────────────────────────

  const fetchTransactions = useCallback(async () => {
    if (!ifa) return
    setTxLoading(true)

    const params = new URLSearchParams()
    if (filterFrom)   params.set('from', filterFrom)
    if (filterTo)     params.set('to', filterTo)
    if (filterStatus) params.set('status', filterStatus)
    if (filterType)   params.set('commission_type', filterType)
    if (filterPolicy) params.set('policy_number', filterPolicy)

    const authHeaders = await getAuthHeaders()
    const res = await fetch(`/api/commission/ifa/transactions?${params}`, { headers: authHeaders })
    if (res.ok) {
      const { transactions: data } = await res.json()
      setTransactions((data as CommissionRecord[]) ?? [])
    }
    setTxLoading(false)
  }, [ifa, filterFrom, filterTo, filterStatus, filterType, filterPolicy])

  useEffect(() => {
    if (ifa) fetchTransactions()
  }, [ifa, fetchTransactions])

  // ── Fetch payment history ────────────────────────────────────────────────────

  const fetchPayments = useCallback(async () => {
    if (!ifa) return
    setPayLoading(true)
    // Use service-role API to avoid RLS and ifa_id UUID mismatch issues.
    // The API finds all IFA UUIDs sharing the same code so historical
    // batches created with temp UUIDs are included.
    const authHeaders = await getAuthHeaders()
    const res = await fetch('/api/commission/ifa/payments', { headers: authHeaders })
    if (res.ok) {
      const { payments: data } = await res.json()
      setPayments(data ?? [])
    }
    setPayLoading(false)
  }, [ifa])

  useEffect(() => {
    if (activeTab === 'payments' && ifa) fetchPayments()
  }, [activeTab, ifa, fetchPayments])

  const fetchAPE = useCallback(async () => {
    if (!ifa) return
    setApeLoading(true)
    const authHeaders = await getAuthHeaders()
    const res = await fetch(`/api/commission/ifa/ape?year=${apeYear}&group_by=${apeGroupBy}`, { headers: authHeaders })
    if (res.ok) {
      const { total, periods } = await res.json()
      setApeTotal(total ?? 0)
      setApePeriods(periods ?? [])
    }
    setApeLoading(false)
  }, [ifa, apeYear, apeGroupBy])

  useEffect(() => {
    if (activeTab === 'ape' && ifa) fetchAPE()
  }, [activeTab, ifa, fetchAPE])

  // ── Client-side Excel export ──────────────────────────────────────────────────

  const handleExport = () => {
    setExporting(true)
    const rows = transactions.map(t => ({
      Date:        t.transaction_date,
      Platform:    t.platform?.name ?? '',
      Policy:      t.policy_number,
      Holder:      t.policy_holder_name ?? '',
      Type:        t.commission_type ?? '',
      'IFA Amount': t.ifa_amount,
      APE:         t.ape ?? '',
      Currency:    t.currency,
      Status:      t.status,
      'IFA Notes': t.ifa_notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
    XLSX.writeFile(wb, `ifa_transactions_${ifa?.code ?? 'export'}_${new Date().toISOString().split('T')[0]}.xlsx`)
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

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--wgi-bg)' }}>
        <div className="text-center">
          <div className="wgi-spinner mx-auto" />
          <p className="mt-4" style={{ color: 'var(--wgi-text-muted)', fontSize: '14px' }}>Loading your dashboard…</p>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: 'var(--wgi-bg)' }}>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

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
              <p style={{ fontSize: '24px', fontWeight: 700, color: accent, marginTop: '6px', letterSpacing: '-0.02em' }}>{formatCurrency(value, 'USD')}</p>
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
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
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
              {/* Filters */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--wgi-border)', background: '#F8FAFC', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                {[
                  { label: 'From', node: <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={filterInputStyle} /> },
                  { label: 'To',   node: <input type="date" value={filterTo}   onChange={e => setFilterTo(e.target.value)}   style={filterInputStyle} /> },
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

          {/* APE SUMMARY TAB */}
          {activeTab === 'ape' && (
            <div style={{ padding: '24px' }}>
              {/* Controls */}
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
                  {/* Total card */}
                  <div style={{ display: 'inline-block', background: 'var(--wgi-navy)', borderRadius: '12px', padding: '16px 24px', marginBottom: '24px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total APE — {apeYear}</p>
                    <p style={{ fontSize: '26px', fontWeight: 700, color: '#fff', marginTop: '4px', letterSpacing: '-0.02em' }}>{formatCurrency(apeTotal, 'USD')}</p>
                  </div>

                  {/* Period table */}
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

        {/* Profile card */}
        <div className="wgi-card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--wgi-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Your Account</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ fontSize: '13px' }}>
            <div><p style={{ color: 'var(--wgi-text-light)', fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>IFA Code</p><p style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ifa?.code}</p></div>
            <div><p style={{ color: 'var(--wgi-text-light)', fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>Email</p><p style={{ color: 'var(--wgi-text)' }}>{ifa?.email}</p></div>
            <div>
              <p style={{ color: 'var(--wgi-text-light)', fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>Status</p>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ifa?.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {ifa?.status}
              </span>
            </div>
            <div>
              <p style={{ color: 'var(--wgi-text-light)', fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>Auth</p>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ifa?.user_id ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                {ifa?.user_id ? 'Linked' : 'Pending link'}
              </span>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────

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
  if (variant === 'primary')   return { ...base, background: 'var(--wgi-navy)', color: '#fff' }
  if (variant === 'export')    return { ...base, background: '#059669', color: '#fff' }
  return { ...base, background: '#fff', border: '1px solid var(--wgi-border)', color: 'var(--wgi-text)' }
}
