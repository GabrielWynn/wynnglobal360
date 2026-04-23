// app/api/commission/uploads/route.ts
// Returns the upload history from csv_upload_batches (most recent first).
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  const url    = new URL(request.url)
  const limit  = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200)

  const { data, error } = await supabaseAdmin
    .from('csv_upload_batches')
    .select(`
      id,
      filename,
      total_rows,
      status,
      uploaded_by_email,
      created_at,
      platform:platforms ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ uploads: data ?? [] })
}
