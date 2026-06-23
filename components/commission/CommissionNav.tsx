'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * Commission admin secondary navigation (DESIGN-COMMISSION.md).
 *
 * Persistent tab bar across the 9 admin workflows, sticky under the hub Navbar.
 * Active tab: navy text + 3px gold bottom border. Replaces the per-page
 * "← Back to Admin" links.
 */

const TABS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/commission/admin',                label: 'Dashboard', exact: true },
  { href: '/commission/admin/master-file',    label: 'Master File' },
  { href: '/commission/admin/upload',         label: 'Upload' },
  { href: '/commission/admin/approvals',      label: 'Approvals' },
  { href: '/commission/admin/payments',       label: 'Payments' },
  { href: '/commission/admin/payment-matrix', label: 'Payment Matrix' },
  { href: '/commission/admin/kpi',            label: 'KPI' },
  { href: '/commission/admin/unmapped',       label: 'Unmapped' },
  { href: '/commission/admin/audit-log',      label: 'Audit Log' },
]

export function CommissionNav() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-16 z-40 flex gap-0 overflow-x-auto border-b border-[var(--wgi-border)] bg-[var(--wgi-surface)] px-6">
      {TABS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'whitespace-nowrap border-b-[3px] px-3.5 py-2.5 text-xs font-semibold transition-colors',
              active
                ? 'border-[var(--wgi-gold)] text-[var(--wgi-navy)]'
                : 'border-transparent text-[var(--wgi-text-muted)] hover:bg-[var(--wgi-bg)] hover:text-[var(--wgi-text)]',
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export default CommissionNav
