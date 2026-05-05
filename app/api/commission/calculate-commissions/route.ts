import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  return NextResponse.json(
    {
      success: false,
      error: 'Legacy calculation endpoint deprecated. Commission processing now uses commission_records during upload and admin workflows.'
    },
    { status: 410 }
  )
}
