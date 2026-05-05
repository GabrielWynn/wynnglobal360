import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const db = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function run() {
  const runId = randomUUID().slice(0, 8)
  const ifaCode = `TST-${runId}`
  const policyNumber = `POL-${runId}`
  const today = new Date().toISOString().slice(0, 10)

  const { data: ifa, error: ifaError } = await db
    .from('ifas')
    .insert({
      code: ifaCode,
      name: `Regression ${ifaCode}`,
      email: `${ifaCode.toLowerCase()}@temp.com`,
      status: 'active',
      role: 'ifa',
    })
    .select('id')
    .single()
  if (ifaError) throw ifaError

  const { data: platform, error: platformError } = await db
    .from('platforms')
    .select('id')
    .limit(1)
    .single()
  if (platformError) throw platformError

  const { data: batch, error: batchError } = await db
    .from('csv_upload_batches')
    .insert({
      platform_id: platform.id,
      filename: `regression-${runId}.csv`,
      total_rows: 1,
      processed_rows: 1,
      mapped_rows: 1,
      unmapped_rows: 0,
      error_rows: 0,
      status: 'completed',
    })
    .select('id')
    .single()
  if (batchError) throw batchError

  const { data: raw, error: rawError } = await db
    .from('raw_commission_data')
    .insert({
      upload_batch_id: batch.id,
      platform_id: platform.id,
      policy_number: policyNumber,
      transaction_date: today,
      gross_amount: 1000,
      calculated_commission: 1000,
      currency: 'USD',
      raw_data: { source: 'commission-e2e-regression' },
      mapping_status: 'mapped',
    })
    .select('id')
    .single()
  if (rawError) throw rawError

  const { data: record, error: recordError } = await db
    .from('commission_records')
    .insert({
      upload_batch_id: batch.id,
      raw_data_id: raw.id,
      transaction_date: today,
      policy_number: policyNumber,
      policy_holder_name: 'Regression Holder',
      ifa_id: ifa.id,
      ifa_code: ifaCode,
      ifa_name: `Regression ${ifaCode}`,
      platform_id: platform.id,
      commission_type: 'Initial',
      commission_type_code: 'Initial',
      amount: 1000,
      currency: 'USD',
      ifa_percentage: 0.6,
      suspense_percentage: 0.1,
      wgi_percentage: 0.3,
      status: 'pending',
      paid: 0,
    })
    .select('id, ifa_amount, unpaid, status')
    .single()
  if (recordError) throw recordError

  assert.equal(record.status, 'pending')
  assert.equal(Number(record.ifa_amount), 600)
  assert.equal(Number(record.unpaid), 600)

  const { error: approveError } = await db
    .from('commission_records')
    .update({ status: 'approved' })
    .eq('id', record.id)
  if (approveError) throw approveError

  const { data: paymentBatch, error: paymentBatchError } = await db
    .from('payment_batches')
    .insert({
      ifa_id: ifa.id,
      total_amount: 600,
      currency: 'USD',
      payment_reference: `PAY-${runId}`,
      payment_date: today,
      transaction_count: 1,
      status: 'paid',
    })
    .select('id')
    .single()
  if (paymentBatchError) throw paymentBatchError

  const { error: payError } = await db
    .from('commission_records')
    .update({
      status: 'paid',
      paid: 600,
      payment_batch_id: paymentBatch.id,
      paid_at: new Date().toISOString(),
    })
    .eq('id', record.id)
  if (payError) throw payError

  const { data: paidRows, error: paidRowsError } = await db
    .from('commission_records')
    .select('ifa_amount, paid, unpaid, status')
    .eq('policy_number', policyNumber)
    .eq('is_deleted', false)
  if (paidRowsError) throw paidRowsError

  assert.equal(paidRows.length, 1)
  assert.equal(paidRows[0].status, 'paid')
  assert.equal(Number(paidRows[0].ifa_amount), 600)
  assert.equal(Number(paidRows[0].paid), 600)
  assert.equal(Number(paidRows[0].unpaid), 0)

  const { data: reportRows, error: reportError } = await db
    .from('commission_records')
    .select('ifa_amount')
    .eq('status', 'paid')
    .eq('policy_number', policyNumber)
  if (reportError) throw reportError

  const reportTotal = reportRows.reduce((sum, row) => sum + Number(row.ifa_amount || 0), 0)
  assert.equal(reportTotal, 600)

  console.log('Commission E2E regression passed.', {
    policyNumber,
    ifaCode,
    reportTotal,
  })
}

run().catch((err) => {
  console.error('Commission E2E regression failed:', err)
  process.exitCode = 1
})
