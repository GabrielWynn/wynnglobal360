// lib/commission-unmapped.ts
// Unmapped policies = live commission_records with no IFA, grouped by policy number.
// commission_records is the single source of truth: the Unmapped page, the dashboard
// and KPI counts, the daily alert and the Unmapped report all read through here so
// they can never disagree.
import type { SupabaseClient } from '@supabase/supabase-js'

/** Placeholder policy number for rows with no policy in the source file (e.g. Agent
 *  Adjustments). Not a real policy — it can't be looked up in Azure or assigned to one IFA. */
export const NO_POLICY = '[NO POLICY]'

export interface UnmappedPolicy {
  id: string
  policy_number: string
  policy_holder_name: string | null
  status: string
  /** When the policy first showed up unmapped. */
  created_at: string
  record_count: number
  platform: { name: string } | null
}

const PAGE = 1000

export async function fetchUnmappedPolicies(db: SupabaseClient): Promise<UnmappedPolicy[]> {
  const byPolicy = new Map<string, UnmappedPolicy>()

  // PostgREST caps a response at 1000 rows — page through so nothing is silently dropped.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('commission_records')
      .select('id, policy_number, policy_holder_name, created_at, platform:platforms(name)')
      .is('ifa_id', null)
      .eq('is_deleted', false)
      .neq('policy_number', NO_POLICY)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)

    for (const row of data ?? []) {
      const existing = byPolicy.get(row.policy_number)
      if (existing) {
        existing.record_count++
        existing.policy_holder_name ??= row.policy_holder_name ?? null
        continue
      }
      byPolicy.set(row.policy_number, {
        id: row.policy_number,
        policy_number: row.policy_number,
        policy_holder_name: row.policy_holder_name ?? null,
        status: 'pending',
        created_at: row.created_at,
        record_count: 1,
        platform: (row.platform as unknown as { name: string } | null) ?? null,
      })
    }

    if (!data || data.length < PAGE) break
  }

  // Newest first.
  return [...byPolicy.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
}
