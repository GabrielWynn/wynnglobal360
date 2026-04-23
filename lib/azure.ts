// lib/azure.ts
// Each exported function creates a fresh ConnectionPool, runs its query, then closes.
// This is required for Vercel serverless — module-level singletons do not survive cold starts.
import sql from 'mssql'

const config: sql.config = {
  server: process.env.AZURE_SERVER || '',
  database: process.env.AZURE_DATABASE || '',
  user: process.env.AZURE_USERNAME || '',
  password: process.env.AZURE_PASSWORD || '',
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000,
  },
  pool: {
    max: 1,
    min: 0,
    idleTimeoutMillis: 5000,
  },
}

/**
 * Look up IFA for a single policy number.
 */
export async function lookupIFAForPolicy(policyNumber: string): Promise<{
  ifa_code: string | null
  ifa_name: string | null
} | null> {
  const pool = new sql.ConnectionPool(config)
  try {
    await pool.connect()
    const result = await pool
      .request()
      .input('policyNumber', sql.NVarChar, policyNumber)
      .query(`
        SELECT TOP 1
          ResponsibleIFA AS ifa_code,
          ResponsibleIFA AS ifa_name
        FROM ContactsExport
        WHERE PlanNumber = @policyNumber
      `)

    if (result.recordset.length === 0) return null
    const record = result.recordset[0]
    return {
      ifa_code: record.ifa_code || null,
      ifa_name: record.ifa_name || null,
    }
  } catch (error) {
    console.error('Azure lookup error:', error)
    return null
  } finally {
    await pool.close().catch(() => {})
  }
}

/**
 * Bulk lookup IFAs for multiple policy numbers.
 * Batches in groups of 1000 to avoid SQL IN-clause limits.
 */
export async function bulkLookupIFAs(policyNumbers: string[]): Promise<
  Map<string, { ifa_code: string; ifa_name: string }>
> {
  const results = new Map<string, { ifa_code: string; ifa_name: string }>()
  if (policyNumbers.length === 0) return results

  const pool = new sql.ConnectionPool(config)
  try {
    await pool.connect()

    const batchSize = 1000
    for (let i = 0; i < policyNumbers.length; i += batchSize) {
      const batch = policyNumbers.slice(i, i + batchSize)
      const placeholders = batch.map((_, idx) => `@p${idx}`).join(',')
      const request = pool.request()
      batch.forEach((policyNumber, idx) => {
        request.input(`p${idx}`, sql.NVarChar, policyNumber)
      })

      const result = await request.query(`
        SELECT
          PlanNumber      AS policy_number,
          ResponsibleIFA  AS ifa_code,
          ResponsibleIFA  AS ifa_name
        FROM ContactsExport
        WHERE PlanNumber IN (${placeholders})
      `)

      result.recordset.forEach(record => {
        if (record.policy_number && record.ifa_code) {
          results.set(record.policy_number, {
            ifa_code: record.ifa_code,
            ifa_name: record.ifa_name || record.ifa_code,
          })
        }
      })
    }

    console.log(`✓ Azure bulk lookup: ${results.size} / ${policyNumbers.length} policies found`)
  } catch (error) {
    console.error('Azure bulk lookup error:', error)
    throw error   // propagate so callers can surface this in stats.errors
  } finally {
    await pool.close().catch(() => {})
  }

  return results
}

/**
 * Test Azure connection — used by /admin/test-azure page.
 */
export async function testAzureConnection(): Promise<{
  success: boolean
  message: string
  recordCount?: number
}> {
  const pool = new sql.ConnectionPool(config)
  try {
    await pool.connect()
    const result = await pool
      .request()
      .query('SELECT COUNT(*) AS count FROM ContactsExport')
    const count = result.recordset[0].count
    return {
      success: true,
      message: `Connected successfully. ${count} policies found in ContactsExport.`,
      recordCount: count,
    }
  } catch (error: any) {
    return { success: false, message: `Connection failed: ${error.message}` }
  } finally {
    await pool.close().catch(() => {})
  }
}
