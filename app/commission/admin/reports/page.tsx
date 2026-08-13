'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthHeaders } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { parseLocalDate } from '@/lib/commission-format'

type ReportType = 'monthly_ifa' | 'monthly_platform' | 'ytd' | 'unmapped' | 'payments' | 'ape'

const TABS: { key: ReportType; label: string }[] = [
  { key: 'ytd', label: 'YTD by IFA' },
  { key: 'monthly_ifa', label: 'Monthly by IFA' },
  { key: 'monthly_platform', label: 'Monthly by Platform' },
  { key: 'ape', label: 'APE by IFA' },
  { key: 'unmapped', label: 'Unmapped Policies' },
  { key: 'payments', label: 'Payment History' },
]

export default function ReportsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<ReportType>('ytd')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [apeGroupBy, setApeGroupBy] = useState<'month' | 'quarter' | 'year'>('month')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadReport() }, [activeTab, year, apeGroupBy])

  const loadReport = async () => {
    setLoading(true)
    setError('')
    const authHeaders = await getAuthHeaders()
    const extra = activeTab === 'ape' ? `&group_by=${apeGroupBy}` : ''
    const res = await fetch(`/api/commission/reports?type=${activeTab}&year=${year}${extra}`, { headers: authHeaders })
    const json = await res.json()
    if (!res.ok) { setError(json.error); setLoading(false); return }
    setData(json.report)
    setLoading(false)
  }

  // ── CSV export ───────────────────────────────────────────────────────────────
  const exportCSV = (rows: string[][], filename: string) => {
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Renderers ────────────────────────────────────────────────────────────────
  const renderYTD = () => {
    if (!data) return null
    const rows = Object.entries(data as Record<string, { name: string; totals: Record<string, number> }>)
    if (!rows.length) return <p className="p-8 text-center text-gray-400">No paid commissions found for {year}.</p>

    const handleExport = () => {
      const csvRows: string[][] = [['IFA Code', 'Name', 'Currency', 'Total Paid']]
      rows.forEach(([code, { name, totals }]) => {
        Object.entries(totals).forEach(([currency, total]) => {
          csvRows.push([code, name, currency, total.toFixed(2)])
        })
      })
      exportCSV(csvRows, `ytd_${year}.csv`)
    }

    return (
      <div>
        <div className="flex justify-end mb-2">
          <button onClick={handleExport} className="text-sm text-blue-600 hover:underline">Export CSV</button>
        </div>
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IFA Code</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">YTD Paid</th>
          </tr></thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.flatMap(([code, { name, totals }]) =>
              Object.entries(totals).map(([currency, total]) => (
                <tr key={`${code}-${currency}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{code}</td>
                  <td className="px-4 py-3">{name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{currency}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(total, currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  const renderMonthlyIFA = () => {
    if (!data) return null
    const report = data as Record<string, Record<string, { total: number; name: string; currency: string }>>
    const ifas = Object.keys(report)
    if (!ifas.length) return <p className="p-8 text-center text-gray-400">No paid commissions for {year}.</p>
    const months = [...new Set(ifas.flatMap(ifa => Object.keys(report[ifa])))].sort()

    const handleExport = () => {
      const csvRows: string[][] = [['IFA', 'Month', 'Total']]
      ifas.forEach(ifa => months.forEach(m => {
        if (report[ifa][m]) csvRows.push([ifa, m, report[ifa][m].total.toFixed(2)])
      }))
      exportCSV(csvRows, `monthly_ifa_${year}.csv`)
    }

    return (
      <div>
        <div className="flex justify-end mb-2">
          <button onClick={handleExport} className="text-sm text-blue-600 hover:underline">Export CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IFA</th>
              {months.map(m => <th key={m} className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">{m.slice(5)}/{m.slice(0,4)}</th>)}
            </tr></thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {ifas.map(ifa => (
                <tr key={ifa} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{ifa}<br/><span className="text-gray-400 font-sans">{report[ifa][months[0]]?.name}</span></td>
                  {months.map(m => (
                    <td key={m} className="px-3 py-3 text-right text-xs">
                      {report[ifa][m] ? formatCurrency(report[ifa][m].total, report[ifa][m].currency) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderMonthlyPlatform = () => {
    if (!data) return null
    const report = data as Record<string, Record<string, { ifa_total: number; gross_total: number; currency: string }>>
    const platforms = Object.keys(report)
    if (!platforms.length) return <p className="p-8 text-center text-gray-400">No data.</p>
    const months = [...new Set(platforms.flatMap(p => Object.keys(report[p])))].sort()

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50"><tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platform</th>
            {months.map(m => <th key={m} className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">{m.slice(5)}/{m.slice(0,4)}</th>)}
          </tr></thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {platforms.map(p => (
              <tr key={p} className="hover:bg-gray-50">
                <td className="px-4 py-3">{p}</td>
                {months.map(m => (
                  <td key={m} className="px-3 py-3 text-right text-xs">
                    {report[p][m]
                      ? <><div>{formatCurrency(report[p][m].ifa_total, report[p][m].currency)}</div><div className="text-gray-400">gross {formatCurrency(report[p][m].gross_total, report[p][m].currency)}</div></>
                      : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderUnmapped = () => {
    const rows = data as any[] ?? []
    if (!rows.length) return <p className="p-8 text-center text-gray-400">No unmapped policies.</p>

    const handleExport = () => {
      const csvRows = [['Policy Number', 'Holder', 'Platform', 'Status', 'Created']]
      rows.forEach(r => csvRows.push([r.policy_number, r.policy_holder_name ?? '', r.platforms?.name ?? '', r.status, r.created_at]))
      exportCSV(csvRows, 'unmapped_policies.csv')
    }

    return (
      <div>
        <div className="flex justify-end mb-2">
          <button onClick={handleExport} className="text-sm text-blue-600 hover:underline">Export CSV</button>
        </div>
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50"><tr>
            {['Policy', 'Holder', 'Platform', 'Status', 'Detected'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.map((r: any) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{r.policy_number}</td>
                <td className="px-4 py-3 text-gray-600">{r.policy_holder_name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.platforms?.name ?? '—'}</td>
                <td className="px-4 py-3"><span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{r.status}</span></td>
                <td className="px-4 py-3 text-xs text-gray-500">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderPayments = () => {
    const rows = data as any[] ?? []
    if (!rows.length) return <p className="p-8 text-center text-gray-400">No payment batches found.</p>

    const handleExport = () => {
      const csvRows = [['IFA Code', 'Name', 'Date', 'Amount', 'Currency', 'Transactions', 'Reference']]
      rows.forEach(r => csvRows.push([
        r.ifas?.code ?? '', r.ifas?.name ?? '', r.payment_date, r.total_amount.toFixed(2),
        r.currency, r.transaction_count, r.payment_reference ?? ''
      ]))
      exportCSV(csvRows, 'payment_history.csv')
    }

    return (
      <div>
        <div className="flex justify-end mb-2">
          <button onClick={handleExport} className="text-sm text-blue-600 hover:underline">Export CSV</button>
        </div>
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50"><tr>
            {['IFA', 'Date', 'Amount', 'Transactions', 'Reference'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.map((r: any) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-mono text-xs">{r.ifas?.code}</div>
                  <div className="text-gray-500 text-xs">{r.ifas?.name}</div>
                </td>
                <td className="px-4 py-3 text-xs">{r.payment_date ? parseLocalDate(r.payment_date).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 font-medium text-green-700">{formatCurrency(r.total_amount, r.currency)}</td>
                <td className="px-4 py-3 text-gray-600">{r.transaction_count}</td>
                <td className="px-4 py-3 text-xs text-gray-500 font-mono">{r.payment_reference ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderAPE = () => {
    if (!data) return null
    const report = data as Record<string, { name: string; periods: Record<string, number> }>
    const ifas = Object.keys(report).sort()
    if (!ifas.length) return <p className="p-8 text-center text-gray-400">No APE data for {year}. Enter APE values in the Master File to see results here.</p>
    const periods = [...new Set(ifas.flatMap(ifa => Object.keys(report[ifa].periods)))].sort()

    // Totals row
    const periodTotals: Record<string, number> = {}
    periods.forEach(p => {
      periodTotals[p] = ifas.reduce((sum, ifa) => sum + (report[ifa].periods[p] ?? 0), 0)
    })
    const grandTotal = ifas.reduce((sum, ifa) => sum + Object.values(report[ifa].periods).reduce((s, v) => s + v, 0), 0)

    const handleExport = () => {
      const csvRows: string[][] = [['IFA Code', 'Name', ...periods, 'Total']]
      ifas.forEach(ifa => {
        const rowTotal = Object.values(report[ifa].periods).reduce((s, v) => s + v, 0)
        csvRows.push([ifa, report[ifa].name, ...periods.map(p => (report[ifa].periods[p] ?? 0).toFixed(2)), rowTotal.toFixed(2)])
      })
      csvRows.push(['', 'TOTAL', ...periods.map(p => periodTotals[p].toFixed(2)), grandTotal.toFixed(2)])
      exportCSV(csvRows, `ape_${year}_${apeGroupBy}.csv`)
    }

    return (
      <div>
        <div className="flex justify-end mb-2">
          <button onClick={handleExport} className="text-sm text-blue-600 hover:underline">Export CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IFA</th>
                {periods.map(p => <th key={p} className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">{p}</th>)}
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {ifas.map(ifa => {
                const rowTotal = Object.values(report[ifa].periods).reduce((s, v) => s + v, 0)
                return (
                  <tr key={ifa} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{ifa}</div>
                      <div className="text-gray-400 text-xs">{report[ifa].name}</div>
                    </td>
                    {periods.map(p => (
                      <td key={p} className="px-3 py-3 text-right text-xs">
                        {report[ifa].periods[p] != null ? formatCurrency(report[ifa].periods[p], 'USD') : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right text-xs font-semibold">{formatCurrency(rowTotal, 'USD')}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr>
                <td className="px-4 py-3 text-xs font-semibold text-gray-700">Total</td>
                {periods.map(p => (
                  <td key={p} className="px-3 py-3 text-right text-xs font-semibold text-gray-700">
                    {formatCurrency(periodTotals[p], 'USD')}
                  </td>
                ))}
                <td className="px-3 py-3 text-right text-xs font-bold text-gray-900">{formatCurrency(grandTotal, 'USD')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    if (loading) return <div className="p-12 text-center text-gray-400">Loading…</div>
    if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>
    switch (activeTab) {
      case 'ytd': return renderYTD()
      case 'monthly_ifa': return renderMonthlyIFA()
      case 'monthly_platform': return renderMonthlyPlatform()
      case 'ape': return renderAPE()
      case 'unmapped': return renderUnmapped()
      case 'payments': return renderPayments()
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <button
          onClick={() => router.push('/commission/admin')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors"
        >
          ← Back to Admin
        </button>
        {/* Selectors */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Year:</label>
            <select value={year} onChange={e => setYear(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {activeTab === 'ape' && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Group by:</label>
              <select value={apeGroupBy} onChange={e => setApeGroupBy(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
                <option value="year">Year</option>
              </select>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow">
          {/* Tabs */}
          <div className="border-b border-gray-200 px-4">
            <nav className="flex flex-wrap">
              {TABS.map(({ key, label }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`px-5 py-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div className="overflow-x-auto">{renderContent()}</div>
        </div>
      </main>
    </div>
  )
}
