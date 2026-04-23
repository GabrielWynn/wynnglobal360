import { NextResponse } from 'next/server'
import { lookupIFAForPolicy } from '@/lib/azure'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

export async function GET(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  try {
    const { searchParams } = new URL(request.url)
    const policy = searchParams.get('policy')
    
    if (!policy) {
      return NextResponse.json({
        error: 'Policy number required'
      }, { status: 400 })
    }

    const result = await lookupIFAForPolicy(policy)
    
    return NextResponse.json({
      success: true,
      policy: policy,
      found: !!result,
      data: result
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}