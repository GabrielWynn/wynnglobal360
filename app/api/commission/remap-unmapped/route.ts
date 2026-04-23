// app/api/commission/remap-unmapped/route.ts
// Re-runs Azure lookup for all commission_records with no IFA assigned,
// then writes the resolved IFA back to commission_records + related tables.
// Source of truth is commission_records (same table the unmapped UI queries),
// so the retry and the UI are always in sync.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { bulkLookupIFAs } from '@/lib/azure'
import { requireAdmin, unauthorised } from '@/lib/auth-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: Request) {
  const userId = await requireAdmin(request)
  if (!userId) return unauthorised()

  const stats = {
    total_checked: 0,
    found_in_azure: 0,
    newly_mapped: 0,
    new_ifas: 0,
    still_unmapped: 0,
    errors: [] as string[]
  }

  try {
    // 1. Fetch all commission_records that have no IFA assigned (mirrors unmapped UI)
    const { data: unmappedCR, error: fetchError } = await supabaseAdmin
      .from('commission_records')
      .select('policy_number, platform_id, policy_holder_name')
      .is('ifa_id', null)
      .eq('is_deleted', false)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!unmappedCR || unmappedCR.length === 0) {
      return NextResponse.json({ ...stats, message: 'No unmapped records found' })
    }

    // 2. Deduplicate by policy_number — keep first occurrence for platform + holder name
    const policyMeta = new Map<string, { platform_id: string | null; holder_name: string }>()
    for (const r of unmappedCR) {
      if (r.policy_number && !policyMeta.has(r.policy_number)) {
        policyMeta.set(r.policy_number, {
          platform_id: r.platform_id ?? null,
          holder_name: r.policy_holder_name ?? '',
        })
      }
    }

    stats.total_checked = policyMeta.size

    // 3. Bulk lookup in Azure SQL (batched in groups of 1000 inside bulkLookupIFAs)
    const uniquePolicyNumbers = [...policyMeta.keys()]
    const azureMappings = await bulkLookupIFAs(uniquePolicyNumbers)
    stats.found_in_azure = azureMappings.size

    if (azureMappings.size === 0) {
      stats.still_unmapped = stats.total_checked
      return NextResponse.json(stats)
    }

    // 4. Cache existing IFAs so we only hit the DB once per unique code
    const { data: existingIFAs } = await supabaseAdmin
      .from('ifas')
      .select('id, code')

    const ifaByCode = new Map<string, string>(
      existingIFAs?.map(ifa => [ifa.code, ifa.id]) ?? []
    )

    // 5. Process each policy found in Azure
    for (const [policyNumber, azureData] of azureMappings.entries()) {
      try {
        const { ifa_code, ifa_name } = azureData

        // ── Get or create IFA ──────────────────────────────────────────────
        let ifaId = ifaByCode.get(ifa_code)

        if (!ifaId) {
          const { data: newIFA, error: ifaError } = await supabaseAdmin
            .from('ifas')
            .insert({
              code: ifa_code,
              name: ifa_name || ifa_code,
              email: `${ifa_code.toLowerCase()}@temp.com`,
              status: 'active',
              role: 'ifa'
            })
            .select('id')
            .single()

          if (ifaError || !newIFA) {
            stats.errors.push(`Failed to create IFA ${ifa_code}: ${ifaError?.message}`)
            continue
          }

          ifaId = newIFA.id
          ifaByCode.set(ifa_code, ifaId!)
          stats.new_ifas++
        }

        const meta = policyMeta.get(policyNumber)!
        const now = new Date().toISOString()

        // ── Upsert policy record ───────────────────────────────────────────
        const { data: existingPolicy } = await supabaseAdmin
          .from('policies')
          .select('id, ifa_id')
          .eq('policy_number', policyNumber)
          .maybeSingle()

        if (!existingPolicy) {
          const { error: policyError } = await supabaseAdmin
            .from('policies')
            .insert({
              policy_number: policyNumber,
              ifa_id: ifaId,
              platform_id: meta.platform_id,
              policy_holder_name: meta.holder_name,
              status: 'active'
            })

          if (policyError) {
            stats.errors.push(`Failed to create policy ${policyNumber}: ${policyError.message}`)
            continue
          }
        } else if (!existingPolicy.ifa_id) {
          await supabaseAdmin
            .from('policies')
            .update({ ifa_id: ifaId })
            .eq('id', existingPolicy.id)
        }

        // ── Update commission_records ──────────────────────────────────────
        const { error: crError } = await supabaseAdmin
          .from('commission_records')
          .update({
            ifa_id:    ifaId,
            ifa_code:  ifa_code,
            ifa_name:  ifa_name ?? ifa_code,
            updated_at: now,
          })
          .eq('policy_number', policyNumber)
          .is('ifa_id', null)

        if (crError) {
          stats.errors.push(`Failed to update commission_records for ${policyNumber}: ${crError.message}`)
          continue
        }

        // ── Also mark any raw_commission_data rows as mapped ───────────────
        await supabaseAdmin
          .from('raw_commission_data')
          .update({ mapping_status: 'mapped' })
          .eq('policy_number', policyNumber)
          .eq('mapping_status', 'unmapped')

        stats.newly_mapped++

        // ── Remove from unmapped_policies queue ────────────────────────────
        await supabaseAdmin
          .from('unmapped_policies')
          .delete()
          .eq('policy_number', policyNumber)

      } catch (policyErr: any) {
        stats.errors.push(`Error processing ${policyNumber}: ${policyErr.message}`)
      }
    }

    stats.still_unmapped = stats.total_checked - stats.newly_mapped

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(stats)
}
