import { NextResponse } from 'next/server'
import { processAllPendingCommissions } from '@/lib/calculation-engine'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const result = await processAllPendingCommissions()
    return NextResponse.json({ ...result, success: true })
  } catch (error: any) {
    console.error('Commission calculation error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
