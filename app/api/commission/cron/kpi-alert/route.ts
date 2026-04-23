// app/api/commission/cron/kpi-alert/route.ts
// Weekly KPI digest email — triggered by Vercel Cron every Monday at 08:00 UTC.
// Reads KPI data + config, builds an HTML summary, sends via Resend REST API.
//
// Required env vars:
//   RESEND_API_KEY          — from resend.com (free tier: 3,000 emails/month)
//   ALERT_EMAIL_FROM        — verified sender address, e.g. "alerts@yourdomain.com"
//   CRON_SECRET             — any secret string; set in Vercel env + vercel.json cron config
//
// Recipients are read from kpi_config.alert_email_recipients (comma-separated).
// If that config value is empty, the route returns 200 with no email sent.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function round2(n: number) { return Math.round(n * 100) / 100 }
function fmt(n: number, cur = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n)
}
function monthsAgo(n: number) {
  const d = new Date(); d.setMonth(d.getMonth() - n); d.setDate(1)
  return d.toISOString().split('T')[0]
}
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString()
}
function currentMonthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function GET(request: Request) {
  // Verify this is a legitimate Vercel Cron request
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // ── Load config ─────────────────────────────────────────────────────────
    const { data: configRows } = await supabaseAdmin
      .from('kpi_config')
      .select('key, value')

    const config: Record<string, string> = {}
    for (const row of configRows ?? []) config[row.key] = row.value

    const recipients = (config['alert_email_recipients'] ?? '')
      .split(',').map(e => e.trim()).filter(Boolean)

    if (recipients.length === 0) {
      return NextResponse.json({ message: 'No recipients configured — set alert_email_recipients in KPI Settings' })
    }

    const maxApprovedDays = parseInt(config['max_approved_days_alert'] ?? '30', 10)
    const thirtyDaysAgo   = daysAgo(maxApprovedDays)
    const monthStart      = currentMonthStart()

    // ── Fetch KPI data in parallel ──────────────────────────────────────────
    const [statusRes, overdueRes, overpayRes, unmappedRes, paidRes, advanceRes] = await Promise.all([
      supabaseAdmin.from('commission_records').select('status, ifa_amount').eq('is_deleted', false),
      supabaseAdmin.from('commission_records').select('id, ifa_code, ifa_amount, currency, updated_at')
        .eq('status', 'approved').eq('is_deleted', false).lt('updated_at', thirtyDaysAgo),
      supabaseAdmin.from('commission_records').select('id, ifa_code, unpaid, currency')
        .eq('is_deleted', false).lt('unpaid', 0),
      supabaseAdmin.from('unmapped_policies').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('payment_batches').select('total_amount, currency').gte('payment_date', monthStart),
      supabaseAdmin.from('commission_records').select('is_advance, reconciled_at, created_at')
        .eq('is_advance', true).eq('is_deleted', false).is('reconciled_at', null),
    ])

    // ── Aggregate ────────────────────────────────────────────────────────────
    const funnel: Record<string, { count: number; total: number }> = {}
    for (const r of statusRes.data ?? []) {
      const s = r.status || 'unknown'
      if (!funnel[s]) funnel[s] = { count: 0, total: 0 }
      funnel[s].count++
      funnel[s].total = round2(funnel[s].total + (r.ifa_amount ?? 0))
    }

    const overdueCount = overdueRes.data?.length ?? 0
    const overdueTotal = round2((overdueRes.data ?? []).reduce((s, r) => s + (r.ifa_amount ?? 0), 0))

    const overpayCount = overpayRes.data?.length ?? 0

    const unmappedCount = unmappedRes.count ?? 0

    const paidThisMonth = round2(
      (paidRes.data ?? []).filter(r => (r.currency || 'USD') === 'USD').reduce((s, r) => s + (r.total_amount ?? 0), 0)
    )

    const unreconciledOld = (advanceRes.data ?? []).filter(r => {
      const ageDays = r.created_at
        ? Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000)
        : 0
      return ageDays > 30
    }).length

    const totalAlerts = overdueCount + overpayCount + unmappedCount + unreconciledOld

    // ── Build HTML email ────────────────────────────────────────────────────
    const statusDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const alertColor = totalAlerts > 0 ? '#DC2626' : '#16A34A'
    const alertText  = totalAlerts > 0 ? `${totalAlerts} item${totalAlerts > 1 ? 's' : ''} require attention` : 'All clear'

    const row = (label: string, value: string, highlight = false) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;color:#6B7280;font-size:13px">${label}</td>` +
      `<td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;font-weight:600;font-size:13px;color:${highlight ? '#DC2626' : '#111827'};text-align:right">${value}</td></tr>`

    const alertRow = (count: number, label: string) => count === 0
      ? `<tr><td style="padding:6px 12px;color:#6B7280;font-size:13px">✓ ${label}</td><td style="padding:6px 12px;text-align:right;font-size:13px;color:#16A34A;font-weight:600">OK</td></tr>`
      : `<tr><td style="padding:6px 12px;color:#6B7280;font-size:13px">⚠ ${label}</td><td style="padding:6px 12px;text-align:right;font-size:13px;color:#DC2626;font-weight:600">${count}</td></tr>`

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>WGI KPI Weekly Digest</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F9FAFB;margin:0;padding:32px 16px">
  <div style="max-width:560px;margin:0 auto">

    <!-- Header -->
    <div style="background:#1E3A5F;color:white;padding:24px;border-radius:8px 8px 0 0">
      <h1 style="margin:0;font-size:20px;font-weight:700">WGI Commission Portal</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:0.8">Weekly KPI Digest · ${statusDate}</p>
    </div>

    <!-- Alert banner -->
    <div style="background:${alertColor};color:white;padding:12px 24px;font-size:14px;font-weight:600">
      ${alertText}
    </div>

    <!-- Pipeline -->
    <div style="background:white;padding:16px 0;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB">
      <p style="margin:0 12px 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9CA3AF">Commission Pipeline</p>
      <table style="width:100%;border-collapse:collapse">
        ${row('Pending Approval', (funnel['pending']?.count ?? 0).toLocaleString())}
        ${row('Approved (Ready to Pay)', `${(funnel['approved']?.count ?? 0).toLocaleString()} · ${fmt(funnel['approved']?.total ?? 0)}`)}
        ${row('Paid This Month (USD)', fmt(paidThisMonth), false)}
        ${row('Unmapped Policies', unmappedCount.toLocaleString(), unmappedCount > 0)}
      </table>
    </div>

    <!-- Alerts -->
    <div style="background:white;padding:16px 0;border:1px solid #E5E7EB;border-top:none">
      <p style="margin:0 12px 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9CA3AF">Alerts</p>
      <table style="width:100%;border-collapse:collapse">
        ${alertRow(overdueCount, `Overdue approved records (>${maxApprovedDays}d) · ${fmt(overdueTotal)}`)}
        ${alertRow(overpayCount, 'Overpayment records (paid > ifa_amount)')}
        ${alertRow(unreconciledOld, 'Unreconciled advances >30 days old')}
        ${alertRow(unmappedCount, 'Unmapped policies')}
      </table>
    </div>

    <!-- Footer -->
    <div style="background:#F3F4F6;padding:16px 24px;border-radius:0 0 8px 8px;border:1px solid #E5E7EB;border-top:none">
      <p style="margin:0;font-size:12px;color:#9CA3AF">
        View full KPI dashboard at <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}/commission/admin/kpi" style="color:#3B82F6">KPI Dashboard</a>
        · Manage alert recipients in <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}/commission/admin/kpi" style="color:#3B82F6">Settings</a>
      </p>
    </div>

  </div>
</body>
</html>`

    // ── Send via Resend ──────────────────────────────────────────────────────
    const resendKey = process.env.RESEND_API_KEY
    const fromAddr  = process.env.ALERT_EMAIL_FROM ?? 'alerts@wgiportal.com'

    if (!resendKey) {
      // Log what would have been sent (useful for testing without Resend set up)
      console.log('[kpi-alert] RESEND_API_KEY not set — email not sent. Recipients:', recipients)
      return NextResponse.json({
        message: 'Dry run — RESEND_API_KEY not configured',
        would_send_to: recipients,
        alert_count: totalAlerts,
      })
    }

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddr,
        to: recipients,
        subject: `WGI KPI Digest · ${totalAlerts > 0 ? `${totalAlerts} alerts` : 'All clear'} · ${new Date().toLocaleDateString('en-GB')}`,
        html,
      }),
    })

    if (!sendRes.ok) {
      const errBody = await sendRes.text()
      console.error('[kpi-alert] Resend error:', errBody)
      return NextResponse.json({ error: `Email send failed: ${errBody}` }, { status: 500 })
    }

    const sendData = await sendRes.json()
    return NextResponse.json({ sent: true, id: sendData.id, recipients, alert_count: totalAlerts })

  } catch (err: any) {
    console.error('[kpi-alert] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
