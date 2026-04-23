import { NextResponse } from 'next/server'
import { testAzureConnection } from '@/lib/azure'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

export async function GET(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()
  try {
    const result = await testAzureConnection()
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error.message
    }, { status: 500 })
  }
}