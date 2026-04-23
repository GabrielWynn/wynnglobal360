import { NextResponse } from 'next/server'
import { bulkLookupIFAs } from '@/lib/azure'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const { policyNumbers } = await request.json()
    
    if (!policyNumbers || !Array.isArray(policyNumbers)) {
      return NextResponse.json({
        error: 'Policy numbers array required'
      }, { status: 400 })
    }

    const mappings = await bulkLookupIFAs(policyNumbers)
    
    // Convert Map to object for JSON serialization
    const mappingsObject: { [key: string]: any } = {}
    mappings.forEach((value, key) => {
      mappingsObject[key] = value
    })
    
    return NextResponse.json({
      success: true,
      count: mappings.size,
      mappings: mappingsObject
    })
  } catch (error: any) {
    console.error('Bulk lookup error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      mappings: {}
    }, { status: 500 })
  }
}