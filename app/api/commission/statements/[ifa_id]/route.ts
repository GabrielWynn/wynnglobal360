// app/api/commission/statements/[ifa_id]/route.ts
// Generates a PDF statement for an IFA using jsPDF.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { jsPDF } from 'jspdf'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'
import autoTable from 'jspdf-autotable'
import { formatCurrency } from '@/lib/currency'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ifa_id: string }> }
) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  const { ifa_id: ifaId } = await params

  try {
    // Fetch IFA details
    const { data: ifa, error: ifaError } = await supabaseAdmin
      .from('ifas')
      .select('id, code, name, email, status')
      .eq('id', ifaId)
      .single()

    if (ifaError || !ifa) return NextResponse.json({ error: 'IFA not found' }, { status: 404 })

    // Compute balances and fetch transactions using ifa_code (denormalized string),
    // not ifa_id (UUID), so duplicate IFA records with different UUIDs are all included.
    const ifaCode = ifa.code

    const { data: allRecs } = await supabaseAdmin
      .from('commission_records')
      .select('ifa_amount, status')
      .eq('ifa_code', ifaCode)
      .eq('is_deleted', false)

    const records = allRecs ?? []
    const available   = records.filter(r => r.status === 'approved').reduce((s, r) => s + (r.ifa_amount ?? 0), 0)
    const totalPaid   = records.filter(r => r.status === 'paid').reduce((s, r) => s + (r.ifa_amount ?? 0), 0)
    const suspended   = records.filter(r => r.status === 'pending').reduce((s, r) => s + (r.ifa_amount ?? 0), 0)
    const totalEarned = available + totalPaid

    // Fetch approved/paid transactions
    const { data: transactions } = await supabaseAdmin
      .from('commission_records')
      .select('transaction_date, commission_type, ifa_amount, currency, status, policy_number, policy_holder_name')
      .eq('ifa_code', ifaCode)
      .eq('is_deleted', false)
      .in('status', ['approved', 'paid'])
      .order('transaction_date', { ascending: false })
      .limit(200)

    // Fetch payment history: use all IFA UUIDs sharing this code so historical
    // batches created with temp UUIDs (before canonical-IFA enrichment) are included.
    const { data: ifasWithCode } = await supabaseAdmin
      .from('ifas')
      .select('id')
      .eq('code', ifaCode)

    const allIfaIds = (ifasWithCode ?? []).map(r => r.id)

    const { data: payments } = await supabaseAdmin
      .from('payment_batches')
      .select('payment_date, total_amount, currency, payment_reference, transaction_count')
      .in('ifa_id', allIfaIds.length ? allIfaIds : ['no-match'])
      .order('payment_date', { ascending: false })
      .limit(20)

    // ── Build PDF ──────────────────────────────────────────────────────────────
    const doc = new jsPDF()
    const generated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    // Header
    doc.setFontSize(18)
    doc.setTextColor(30, 64, 175) // blue-700
    doc.text('WGI Commission Statement', 14, 20)

    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(`Generated: ${generated}`, 14, 28)

    // IFA info
    doc.setFontSize(12)
    doc.setTextColor(30)
    doc.text(`IFA: ${ifa.name} (${ifa.code})`, 14, 40)
    doc.text(`Email: ${ifa.email}`, 14, 47)
    doc.text(`Status: ${ifa.status}`, 14, 54)

    // Balance summary
    doc.setFontSize(11)
    doc.setTextColor(30)
    doc.text('Balance Summary', 14, 66)

    ;(autoTable as any)(doc, {
      startY: 70,
      head: [['Metric', 'Amount (USD)']],
      body: [
        ['Available Balance', formatCurrency(available, 'USD')],
        ['Suspended Balance', formatCurrency(suspended, 'USD')],
        ['Total Earned',      formatCurrency(totalEarned, 'USD')],
        ['Total Paid',        formatCurrency(totalPaid, 'USD')],
      ],
      theme: 'striped',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 64, 175] },
    })

    // Transactions
    const afterBalance = (doc as any).lastAutoTable?.finalY ?? 110
    doc.setFontSize(11)
    doc.text('Transaction History', 14, afterBalance + 10)

    ;(autoTable as any)(doc, {
      startY: afterBalance + 14,
      head: [['Date', 'Policy', 'Holder', 'Type', 'Amount', 'Status']],
      body: (transactions ?? []).map((t: any) => [
        t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—',
        t.policy_number ?? '—',
        t.policy_holder_name ?? '—',
        t.commission_type ?? '—',
        formatCurrency(t.ifa_amount, t.currency ?? 'USD'),
        t.status,
      ]),
      theme: 'striped',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
    })

    // Payment history (new page if needed)
    if (payments?.length) {
      const afterTx = (doc as any).lastAutoTable?.finalY ?? 200
      const remaining = doc.internal.pageSize.height - afterTx
      if (remaining < 60) doc.addPage()
      const payY = remaining < 60 ? 20 : afterTx + 10

      doc.setFontSize(11)
      doc.text('Payment History', 14, payY)

      ;(autoTable as any)(doc, {
        startY: payY + 4,
        head: [['Payment Date', 'Amount', 'Transactions', 'Reference']],
        body: payments.map((p: any) => [
          p.payment_date ? new Date(p.payment_date).toLocaleDateString() : '—',
          formatCurrency(p.total_amount, p.currency ?? 'USD'),
          p.transaction_count,
          p.payment_reference ?? '—',
        ]),
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [5, 150, 105] },
      })
    }

    const pdfBytes = doc.output('arraybuffer')
    const filename = `${ifa.code}_statement_${new Date().toISOString().split('T')[0]}.pdf`

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
