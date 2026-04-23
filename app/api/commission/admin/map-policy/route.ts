// app/api/commission/admin/map-policy/route.ts
// Manually assigns an IFA to an unmapped policy.
// Side effects (all atomic):
//   1. Updates ALL commission_records for the policy with the IFA (admin override)
//   2. Marks raw_commission_data rows as 'mapped'
//   3. Upserts into manual_policy_mappings (persistent — future uploads auto-resolve)
//   4. Upserts the policies table
//   5. Deletes from unmapped_policies
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  try {
    const { policy_number, ifa_id } = await request.json()

    if (!policy_number || !ifa_id) {
      return NextResponse.json(
        { error: 'policy_number and ifa_id are required' },
        { status: 400 }
      )
    }

    // 1. Resolve the IFA — fail fast if it doesn't exist
    const { data: ifa, error: ifaError } = await supabaseAdmin
      .from('ifas')
      .select('id, code, name')
      .eq('id', ifa_id)
      .single()

    if (ifaError || !ifa) {
      return NextResponse.json({ error: 'IFA not found' }, { status: 404 })
    }

    const now = new Date().toISOString()

    // 2. Update ALL commission_records for this policy (admin override — re-maps any
    //    records that Azure previously assigned to the wrong IFA, not just null ones)
    const { data: updatedCR, error: crError } = await supabaseAdmin
      .from('commission_records')
      .update({
        ifa_id:   ifa.id,
        ifa_code: ifa.code,
        ifa_name: ifa.name,
        updated_at: now,
      })
      .eq('policy_number', policy_number)
      .select('id')

    if (crError) {
      return NextResponse.json(
        { error: `Failed to update commission records: ${crError.message}` },
        { status: 500 }
      )
    }

    // 3. Mark raw_commission_data rows as mapped
    await supabaseAdmin
      .from('raw_commission_data')
      .update({ mapping_status: 'mapped' })
      .eq('policy_number', policy_number)
      .eq('mapping_status', 'unmapped')

    // 4. Persist the mapping so future uploads auto-resolve this policy
    const { error: mpmError } = await supabaseAdmin
      .from('manual_policy_mappings')
      .upsert(
        {
          policy_number,
          ifa_id:    ifa.id,
          ifa_code:  ifa.code,
          ifa_name:  ifa.name,
          updated_at: now,
          created_by: userId,
        },
        { onConflict: 'policy_number' }
      )

    if (mpmError) {
      return NextResponse.json(
        { error: `Failed to save manual mapping: ${mpmError.message}` },
        { status: 500 }
      )
    }

    // 5. Upsert the policies table (may not exist yet for purely unmapped policies)
    const { data: existingPolicy } = await supabaseAdmin
      .from('policies')
      .select('id, ifa_id')
      .eq('policy_number', policy_number)
      .maybeSingle()

    if (!existingPolicy) {
      await supabaseAdmin.from('policies').insert({
        policy_number,
        ifa_id:   ifa.id,
        status:   'active',
      })
    } else {
      // Always update — admin override should correct a previously wrong IFA
      await supabaseAdmin
        .from('policies')
        .update({ ifa_id: ifa.id })
        .eq('id', existingPolicy.id)
    }

    // 6. Remove from unmapped_policies queue
    await supabaseAdmin
      .from('unmapped_policies')
      .delete()
      .eq('policy_number', policy_number)

    return NextResponse.json({
      success: true,
      policy_number,
      ifa_code: ifa.code,
      ifa_name: ifa.name,
      commission_records_updated: updatedCR?.length ?? 0,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
