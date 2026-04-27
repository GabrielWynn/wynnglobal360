// app/api/commission/commission-records/route.ts
// GET — paginated load of all commission_records for the master file (admin only).
// Uses service role so RLS never interferes with admin access.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PAGE = 1000

export async function GET(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  const { searchParams } = new URL(request.url)
  const includeDeleted = searchParams.get('include_deleted') === 'true'

  try {
    let allData: any[] = []
    let from = 0

    while (true) {
      let q = supabaseAdmin
        .from('commission_records')
        .select('*, platform:platforms(name), upload_batch:csv_upload_batches(filename)')
        .order('transaction_date', { ascending: false })
        .range(from, from + PAGE - 1)

      if (!includeDeleted) q = q.eq('is_deleted', false)

      const { data: page, error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!page || page.length === 0) break
      allData = allData.concat(page)
      if (page.length < PAGE) break
      from += PAGE
    }

    return NextResponse.json({ records: allData })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
