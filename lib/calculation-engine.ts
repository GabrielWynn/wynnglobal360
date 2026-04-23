// lib/calculation-engine.ts
import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Create server-side client with service role (bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

interface RawCommissionData {
  id: string
  policy_number: string
  transaction_date: string
  commission_type_code: string
  gross_amount: number
  platform_id: string
  currency: string
  raw_data: any
}

interface PaymentMatrixRule {
  id: string
  ifa_rate: number
  company_rate: number
  has_establishment_periods: boolean
  establishment_config: {
    periods: number
    splits: number[]
    release_months: number[]
    start_from: string
  } | null
}

interface CommissionTransaction {
  ifa_id: string
  policy_id: string
  ifa_amount: number
  company_amount: number
  suspense_amount: number
  has_establishment_period: boolean
  establishment_payment_number: number
  establishment_release_date: string | null
  parent_transaction_id: string | null
}

interface CommissionTransactionInsert extends CommissionTransaction {
  raw_data_id: string
  transaction_date: string
  policy_number: string
  status: string
  currency: string
}

interface CalculationResult {
  success: boolean
  transactions: CommissionTransaction[]
  errors: string[]
}

/**
 * Calculate commissions for a raw commission data record
 */
export async function calculateCommission(rawDataId: string): Promise<CalculationResult> {
  const result: CalculationResult = {
    success: false,
    transactions: [],
    errors: []
  }

  try {
    // 1. Get raw commission data
    const { data: rawData, error: rawError } = await supabaseAdmin
      .from('raw_commission_data')
      .select('*')
      .eq('id', rawDataId)
      .single()

    if (rawError || !rawData) {
      result.errors.push('Raw commission data not found')
      return result
    }

    // 2. Get policy and IFA mapping
    console.log(`Looking up policy: ${rawData.policy_number}`)

    const { data: policy, error: policyError } = await supabase
      .from('policies')
      .select('id, ifa_id, platform_id, commencement_date')
      .eq('policy_number', rawData.policy_number)
      .single()

    console.log('Policy lookup result:', { policy, error: policyError })

    if (policyError || !policy) {
      console.error(`Policy lookup failed for ${rawData.policy_number}:`, policyError)
      result.errors.push(`Policy ${rawData.policy_number} not found or not mapped. Error: ${policyError?.message || 'Not found'}`)
      return result
    }

    if (!policy.ifa_id) {
      result.errors.push(`Policy ${rawData.policy_number} has no IFA assigned`)
      return result
    }

    // 3. Find matching payment matrix rule
    const rule = await findMatchingRule(
      policy.platform_id,
      policy.ifa_id,
      rawData.commission_type_code,
      rawData.transaction_date
    )

    if (!rule) {
      result.errors.push(`No payment matrix rule found for commission type: ${rawData.commission_type_code}`)
      return result
    }

    // FIX B: Warn only if rates EXCEED 1.0 — it is valid for ifa_rate + company_rate < 1.0
    // (e.g. a platform fee or retained margin accounts for the remainder).
    const rateSum = (rule.ifa_rate || 0) + (rule.company_rate || 0)
    if (rateSum > 1.0 + 0.0001) {
      console.warn(
        `Payment matrix rule ${rule.id} has combined rates of ${rateSum.toFixed(4)} which exceeds 1.0. ` +
        `IFA rate: ${rule.ifa_rate}, Company rate: ${rule.company_rate}. ` +
        `This will pay out more than the gross amount — check rule configuration.`
      )
    }

    // 4. Calculate amounts
    const grossAmount = rawData.gross_amount || 0
    const ifaTotal = grossAmount * (rule.ifa_rate || 0)
    const companyAmount = grossAmount * (rule.company_rate || 0)

    // 5. Handle establishment periods
    if (rule.has_establishment_periods && rule.establishment_config) {
      const config = rule.establishment_config
      const splits = config.splits
      const releaseMonths = config.release_months

      // FIX D: Validate splits sum to 1.0 before distributing amounts
      const splitsSum = splits.reduce((sum, s) => sum + s, 0)
      if (Math.abs(splitsSum - 1.0) > 0.0001) {
        result.errors.push(
          `Establishment period splits for rule ${rule.id} sum to ${splitsSum.toFixed(4)}, not 1.0. ` +
          `Splits: [${splits.join(', ')}]. Fix the payment matrix rule before recalculating.`
        )
        return result
      }

      // FIX C: Respect start_from field — 'transaction_date' uses the CSV date,
      // anything else (including 'commencement_date') uses the policy start date.
      const baseDate =
        config.start_from === 'transaction_date'
          ? rawData.transaction_date
          : (policy.commencement_date || rawData.transaction_date)

      for (let i = 0; i < splits.length; i++) {
        const splitAmount = ifaTotal * splits[i]
        const releaseDate = calculateReleaseDate(baseDate, releaseMonths[i])

        result.transactions.push({
          ifa_id: policy.ifa_id,
          policy_id: policy.id,
          ifa_amount: splitAmount,
          company_amount: i === 0 ? companyAmount : 0, // Company amount only on first payment
          suspense_amount: i > 0 ? splitAmount : 0,    // Payments 2+ are held in suspense
          has_establishment_period: true,
          establishment_payment_number: i + 1,
          establishment_release_date: releaseDate,
          parent_transaction_id: null // FIX #1: resolved during DB insert in processAllPendingCommissions
        })
      }
    } else {
      // No establishment period - simple payment
      result.transactions.push({
        ifa_id: policy.ifa_id,
        policy_id: policy.id,
        ifa_amount: ifaTotal,
        company_amount: companyAmount,
        suspense_amount: 0,
        has_establishment_period: false,
        establishment_payment_number: 1,
        establishment_release_date: null,
        parent_transaction_id: null
      })
    }

    result.success = true
  } catch (error: any) {
    result.errors.push(`Calculation error: ${error.message}`)
  }

  return result
}

/**
 * Find the most specific matching payment matrix rule using a 4-level priority:
 *
 *   1. IFA-specific  + exact commission_type_code  (most specific)
 *   2. IFA-specific  + commission_type_code IS NULL (IFA wildcard)
 *   3. Platform-wide + exact commission_type_code  (ifa_id IS NULL, type-specific)
 *   4. Platform-wide + commission_type_code IS NULL (least specific, catch-all)
 *
 * The column payment_matrix_rules.commission_type_code is added by migration
 * supabase/migrations/001_add_commission_type_to_payment_matrix.sql.
 * NULL means the rule applies to all commission types.
 */
async function findMatchingRule(
  platformId: string,
  ifaId: string,
  commissionTypeCode: string,
  transactionDate: string
): Promise<PaymentMatrixRule | null> {
  const dateFilter = `effective_end_date.is.null,effective_end_date.gte.${transactionDate}`

  // Priority 1: IFA-specific + exact type match
  const { data: rule1 } = await supabase
    .from('payment_matrix_rules')
    .select('*')
    .eq('platform_id', platformId)
    .eq('ifa_id', ifaId)
    .eq('commission_type_code', commissionTypeCode)
    .eq('is_active', true)
    .lte('effective_start_date', transactionDate)
    .or(dateFilter)
    .single()

  if (rule1) return rule1

  // Priority 2: IFA-specific wildcard (no type restriction)
  const { data: rule2 } = await supabase
    .from('payment_matrix_rules')
    .select('*')
    .eq('platform_id', platformId)
    .eq('ifa_id', ifaId)
    .is('commission_type_code', null)
    .eq('is_active', true)
    .lte('effective_start_date', transactionDate)
    .or(dateFilter)
    .single()

  if (rule2) return rule2

  // Priority 3: Platform-wide + exact type match
  const { data: rule3 } = await supabase
    .from('payment_matrix_rules')
    .select('*')
    .eq('platform_id', platformId)
    .is('ifa_id', null)
    .eq('commission_type_code', commissionTypeCode)
    .eq('is_active', true)
    .lte('effective_start_date', transactionDate)
    .or(dateFilter)
    .single()

  if (rule3) return rule3

  // Priority 4: Platform-wide wildcard (catch-all)
  const { data: rule4 } = await supabase
    .from('payment_matrix_rules')
    .select('*')
    .eq('platform_id', platformId)
    .is('ifa_id', null)
    .is('commission_type_code', null)
    .eq('is_active', true)
    .lte('effective_start_date', transactionDate)
    .or(dateFilter)
    .single()

  return rule4 || null
}

/**
 * Calculate release date based on start date and months to add
 */
function calculateReleaseDate(startDate: string, monthsToAdd: number): string {
  const date = new Date(startDate)
  date.setMonth(date.getMonth() + monthsToAdd)
  return date.toISOString().split('T')[0]
}

/**
 * Process all mapped raw commission data that has not yet been calculated.
 * FIX #5: Iterates in batches of 100 until all records are processed (no hard limit).
 * FIX #2: Recalculates IFA balances for all affected IFAs after processing.
 */
export async function processAllPendingCommissions(): Promise<{
  processed: number
  success: number
  failed: number
  errors: string[]
}> {
  const stats = {
    processed: 0,
    success: 0,
    failed: 0,
    errors: [] as string[]
  }

  try {
    // FIX #5: Paginate through all mapped records instead of stopping at 100
    let offset = 0
    const batchSize = 100
    // FIX #2: Track affected IFAs to recalculate balances after all processing
    const affectedIfaIds = new Set<string>()

    while (true) {
      // FIX #4: Fetch currency alongside id and policy_number
      const { data: rawDataList } = await supabase
        .from('raw_commission_data')
        .select('id, policy_number, currency')
        .eq('mapping_status', 'mapped')
        .range(offset, offset + batchSize - 1)

      if (!rawDataList || rawDataList.length === 0) break

      stats.processed += rawDataList.length

      for (const rawData of rawDataList) {
        const result = await calculateCommission(rawData.id)

        if (result.success) {
          // FIX #1: Track the first establishment transaction's DB ID so subsequent
          // splits can reference it via parent_transaction_id
          let parentTransactionId: string | null = null
          let batchFailed = false

          for (const transaction of result.transactions) {
            if (batchFailed) break

            // FIX A: Establishment period payments 2+ must be 'suspended' (held
            // until their release date). Only payment 1 is immediately 'calculated'.
            const isSubsequentSplit =
              transaction.has_establishment_period &&
              transaction.establishment_payment_number > 1

            const transactionData: CommissionTransactionInsert = {
              raw_data_id: rawData.id,
              ...transaction,
              // FIX #1: Link splits 2, 3... back to split 1's DB-generated ID
              parent_transaction_id: isSubsequentSplit ? parentTransactionId : null,
              transaction_date: new Date().toISOString().split('T')[0],
              policy_number: rawData.policy_number,
              // FIX A: 'suspended' for subsequent splits, 'calculated' for immediate payments
              status: isSubsequentSplit ? 'suspended' : 'calculated',
              // FIX #4: Use the currency from the source data, fall back to USD
              currency: rawData.currency || 'USD'
            }

            const { data: savedTransaction, error } = await supabase
              .from('commission_transactions')
              .insert(transactionData)
              .select('id')
              .single()

            if (error) {
              stats.errors.push(`Failed to save transaction for ${rawData.policy_number}: ${error.message}`)
              stats.failed++
              batchFailed = true
            } else {
              // FIX #1: Capture the first establishment payment's ID for subsequent splits
              if (
                transaction.has_establishment_period &&
                transaction.establishment_payment_number === 1
              ) {
                parentTransactionId = savedTransaction.id
              }
              // FIX #2: Record which IFAs were affected
              affectedIfaIds.add(transaction.ifa_id)
              stats.success++
            }
          }

          if (!batchFailed) {
            // Mark raw data as calculated
            await supabase
              .from('raw_commission_data')
              .update({ mapping_status: 'calculated' })
              .eq('id', rawData.id)
          }
        } else {
          stats.failed++
          stats.errors.push(...result.errors)
        }
      }

      // FIX #5: Stop when fewer than batchSize records were returned (last page)
      if (rawDataList.length < batchSize) break
      offset += batchSize
    }

    // FIX #2: Recalculate balances for every IFA that had transactions saved
    for (const ifaId of affectedIfaIds) {
      const ok = await recalculateIFABalances(ifaId)
      if (!ok) {
        stats.errors.push(`Failed to recalculate balances for IFA ${ifaId}`)
      }
    }
  } catch (error: any) {
    stats.errors.push(`Processing error: ${error.message}`)
  }

  return stats
}

/**
 * Recalculate IFA balances from all commission transactions.
 * FIX #7: totalEarned now only sums positive ifa_amounts (excludes chargebacks/negatives)
 * so it correctly represents gross lifetime earnings.
 */
export async function recalculateIFABalances(ifaId: string): Promise<boolean> {
  try {
    const { data: transactions } = await supabase
      .from('commission_transactions')
      .select('ifa_amount, suspense_amount, status')
      .eq('ifa_id', ifaId)

    if (!transactions) return false

    // Available balance: calculated or approved, not yet paid
    const currentBalance = transactions
      .filter(t => t.status === 'calculated' || t.status === 'approved')
      .reduce((sum, t) => sum + (t.ifa_amount || 0), 0)

    // Held in suspense pending establishment period release
    const suspendedBalance = transactions
      .filter(t => t.status === 'suspended')
      .reduce((sum, t) => sum + (t.suspense_amount || 0), 0)

    // FIX #7: Gross lifetime earnings — positive amounts only, all statuses
    const totalEarned = transactions
      .filter(t => (t.ifa_amount || 0) > 0)
      .reduce((sum, t) => sum + (t.ifa_amount || 0), 0)

    // Total amount already paid out
    const totalPaid = transactions
      .filter(t => t.status === 'paid')
      .reduce((sum, t) => sum + (t.ifa_amount || 0), 0)

    // Absolute value of all negative transactions (chargebacks / clawbacks)
    const negativeBalance = transactions
      .filter(t => (t.ifa_amount || 0) < 0)
      .reduce((sum, t) => sum + Math.abs(t.ifa_amount || 0), 0)

    await supabase
      .from('ifa_balances')
      .upsert({
        ifa_id: ifaId,
        current_balance: currentBalance,
        suspended_balance: suspendedBalance,
        negative_balance: negativeBalance,
        total_earned: totalEarned,
        total_paid: totalPaid,
        updated_at: new Date().toISOString()
      })

    return true
  } catch (error) {
    console.error('Error recalculating balances:', error)
    return false
  }
}
