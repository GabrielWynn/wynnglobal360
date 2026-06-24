# Design System — WGI Commission Module

## Scope

This document covers `app/commission/**` and `components/commission/**` only.
For hub-wide tokens and the Model Portfolio module, see `DESIGN.md`.

## Product Context

- **What this is:** Finance ops back-office for Wynn Global admins (9 admin workflows) and IFAs (self-service portal). Tracks commission records from upload through approval and payment.
- **Who it's for:** WGI ops admins who process commissions; IFAs who check their balance and statements.
- **Space/industry:** Insurance-linked wealth management — commission operations.
- **Project type:** Authenticated internal tool / admin dashboard.
- **Memorable thing:** Every dollar is accounted for. Credibility + operational speed + institutional authority — all three equally. Nothing decorative competes with the data.
- **Scope note:** Reuses all WGI brand tokens. Commission-scoped tokens are prefixed `--cm-*` to avoid collisions.

## Aesthetic Direction

- **Direction:** Industrial/Utilitarian finance ops — dense, scannable, audit-grade
- **Decoration level:** Minimal — no hero panels, no decorative gradients, no icon grids
- **Mood:** Every visual choice signals "this is where real money is tracked." White surfaces, navy structure, gold accent reserved for active state only. Feels like a bank's internal system — familiar to anyone who's used Bloomberg or Salesforce FSC.
- **Reference:** Bloomberg Terminal (density + authority), Salesforce Financial Services Cloud (workflow structure), WGI Model Portfolio DESIGN.md (brand tokens)

## Information Architecture

### Admin shell (`/commission/admin/**`)

Two-tier navigation:
1. Hub header (shared): WGI 360 logo + module switcher + user avatar
2. Commission secondary nav (flat underline tabs): Dashboard · Master File · Upload · Approvals · Payments · Payment Matrix · KPI · Unmapped · Audit Log

**No sidebar.** The admin workflows are a linear sequence (upload → approve → pay), not a browseable hierarchy.

### IFA portal (`/commission/ifa`)

Simplified centered layout. Same tokens, wider breathing room. No secondary nav — single-page with tab bar (Transactions · Payments · APE Summary).

### Page types

| Route | Pattern |
|-------|---------|
| `/commission/admin` | Alert banners + stat strip + charts |
| `/commission/admin/master-file` | Full-width ag-grid with filter toolbar |
| `/commission/admin/upload` | Step-based form + CSV preview table |
| `/commission/admin/approvals` | Filterable table + bulk select + action bar |
| `/commission/admin/payments` | IFA summary cards + payment modal |
| `/commission/admin/payment-matrix` | Rules grid + establishment period editor |
| `/commission/admin/kpi` | KPI cards + bar/line charts + period switcher |
| `/commission/admin/unmapped` | Alert list + inline IFA assign dropdown |
| `/commission/admin/audit-log` | Filterable timeline table + diff viewer |
| `/commission/ifa` | Balance strip + tab bar + transaction table |

## Typography

Raleway is the WGI brand font, already loaded globally. JetBrains Mono is added for monetary and identifier values in the commission module.

**Loading:** Add to root layout or commission layout:
```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```
(Raleway is already loaded hub-wide.)

| Role | Font | Size | Weight | Notes |
|------|------|------|--------|-------|
| Page heading | Raleway | 18px | 700 | navy `#1B2D45` |
| Section label / tab | Raleway | 12px | 600 | uppercase, letter-spacing 0.06em, muted |
| Table header | Raleway | 10px | 700 | uppercase, letter-spacing 0.1em, white on navy header |
| Stat card value | Raleway | 22px | 700 | navy; monetary values use JetBrains Mono at 18px |
| Stat card label | Raleway | 10px | 600 | uppercase, letter-spacing 0.1em, muted |
| Table body / form label | Raleway | 12px | 500 | `#1A202C` |
| Monetary cell | JetBrains Mono | 12px | 400 | `font-variant-numeric: tabular-nums` always |
| Policy number / IFA code / ref | JetBrains Mono | 11px | 400 | muted `#64748B` |
| Badge / action label | Raleway | 10px | 700 | uppercase, letter-spacing 0.06em |

### Typography rationale

- Raleway is the established WGI brand font — consistency across hub modules.
- JetBrains Mono for monetary and identifier values: column alignment is a financial accuracy signal. Bloomberg, Reuters, and every serious trading terminal use monospaced numerals. It also visually distinguishes data cells from label cells without color alone.

## Color

### WGI brand tokens (inherited — do not redefine)

These are defined in `app/globals.css` and apply hub-wide. Commission pages use them directly.

| Token | Hex | Usage in Commission |
|-------|-----|---------------------|
| `--wgi-navy` | `#1B2D45` | ag-grid header, page headings, primary buttons, stat values, tab active text |
| `--wgi-gold` | `#C8A96E` | Active tab underline (3px), ag-grid column resize handle, cell-dirty left border, input focus ring |
| `--wgi-bg` | `#F8FAFC` | Page canvas, ag-grid row hover, chart card background |
| `--wgi-surface` | `#FFFFFF` | Stat strip, chart cards, table surface, modals |
| `--wgi-border` | `#E2E8F0` | All borders: table rules, card outlines, input default |
| `--wgi-text` | `#1A202C` | Table body, primary labels |
| `--wgi-text-muted` | `#64748B` | Secondary labels, chart axis, muted cell values |
| `--wgi-text-light` | `#94A3B8` | Stat sub-label, placeholder text |

### Commission-scoped tokens (add to `app/globals.css`)

```css
:root {
  /* Status badge tokens */
  --cm-status-pending-bg:    #FEF3C7;
  --cm-status-pending-text:  #78350F;
  --cm-status-approved-bg:   #D1FAE5;
  --cm-status-approved-text: #065F46;
  --cm-status-rejected-bg:   #FEE2E2;
  --cm-status-rejected-text: #7F1D1D;
  --cm-status-paid-bg:       #E8EDF3;
  --cm-status-paid-text:     #1B2D45;
  --cm-status-suspended-bg:  #F5F3FF;
  --cm-status-suspended-text:#4C1D95;
  --cm-status-advance-bg:    #FFF7ED;
  --cm-status-advance-text:  #9A3412;

  /* Alert banner tokens */
  --cm-alert-warning-bg:     #FFF7ED;
  --cm-alert-warning-border: #F59E0B;
  --cm-alert-warning-text:   #92400E;
  --cm-alert-critical-bg:    #FEF2F2;
  --cm-alert-critical-border:#EF4444;
  --cm-alert-critical-text:  #7F1D1D;

  /* Chart palette — replaces current rainbow */
  --cm-chart-1: #1B2D45; /* wgi-navy */
  --cm-chart-2: #C8A96E; /* wgi-gold */
  --cm-chart-3: #3D6898; /* navy-400 */
  --cm-chart-4: #7B96B2; /* slate-blue */
  --cm-chart-5: #8C7355; /* warm brown */
  --cm-chart-6: #A3B8CC; /* lightest blue-slate */

  /* Finance semantic (shared with Model Portfolio) */
  --cm-gain: #00873E;
  --cm-loss: #CC0000;
}
```

### Color rationale

**Status badges:** Warm amber for pending (not urgent but needs action), green for approved, red for rejected, navy for paid (settled — authoritative, not celebratory), purple for suspended (genuinely unusual state — the one place a non-navy/gold color is justified), orange-brown for advance (structurally different from a regular transaction).

**Chart palette:** The current rainbow (`#3B82F6`, `#10B981`, `#F59E0B`, `#8B5CF6`, `#EF4444`, `#06B6D4`) makes charts feel like a startup marketing deck. The navy-anchored desaturated palette reads as designed, not defaulted.

**Action buttons:** Navy primary — not blue. Blue (`--wgi-accent`) is reserved for external links. Using blue for buttons would create false visual hierarchy against the blue-ish chart series colors.

### Anti-patterns to avoid

- Rainbow fills for chart series (use `--cm-chart-*`)
- Tailwind semantic badge classes (`bg-green-100 text-green-800`) — use `--cm-status-*` tokens
- Blue (`--wgi-accent`) for primary buttons
- Red fill buttons for "Reject" — reject is a secondary action (white bg, red text only)
- Color-coding buttons by operation type (approve=green, reject=red, etc.)

## Status Badge Component

```tsx
// components/commission/StatusBadge.tsx
const STATUS_CLASSES: Record<string, string> = {
  pending:   'bg-[var(--cm-status-pending-bg)]   text-[var(--cm-status-pending-text)]',
  approved:  'bg-[var(--cm-status-approved-bg)]  text-[var(--cm-status-approved-text)]',
  rejected:  'bg-[var(--cm-status-rejected-bg)]  text-[var(--cm-status-rejected-text)]',
  paid:      'bg-[var(--cm-status-paid-bg)]       text-[var(--cm-status-paid-text)]',
  suspended: 'bg-[var(--cm-status-suspended-bg)]  text-[var(--cm-status-suspended-text)]',
  advance:   'bg-[var(--cm-status-advance-bg)]    text-[var(--cm-status-advance-text)]',
}

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase().replace(/[^a-z]/g, '')
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.06em] uppercase ${STATUS_CLASSES[key] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  )
}
```

## ag-Grid Theme Override

The master file uses `ag-theme-alpine`. Override with WGI tokens in `app/globals.css` (or a commission-scoped CSS file):

```css
.ag-theme-alpine {
  /* Header */
  --ag-header-background-color: var(--wgi-navy);
  --ag-header-foreground-color: rgba(255, 255, 255, 0.85);
  --ag-header-column-resize-handle-color: rgba(200, 169, 110, 0.6); /* gold */
  --ag-header-column-separator-color: rgba(255, 255, 255, 0.1);

  /* Rows */
  --ag-background-color: var(--wgi-surface);
  --ag-odd-row-background-color: var(--wgi-surface);
  --ag-row-hover-color: var(--wgi-bg);
  --ag-selected-row-background-color: #EEF3F9;

  /* Borders */
  --ag-border-color: var(--wgi-border);
  --ag-cell-horizontal-border: solid var(--wgi-border);
  --ag-borders: solid var(--wgi-border);
  --ag-borders-critical: solid var(--wgi-border);

  /* Inputs / editing */
  --ag-input-focus-border-color: var(--wgi-gold);
  --ag-range-selection-border-color: var(--wgi-navy);

  /* Typography */
  --ag-font-family: 'Raleway', sans-serif;
  --ag-font-size: 12px;

  /* Density */
  --ag-row-height: 32px;
  --ag-header-height: 36px;
  --ag-cell-horizontal-padding: 12px;
}

/* Dirty/unsaved cell: gold left border + warm background tint */
.ag-cell.cell-dirty {
  border-left: 2px solid var(--wgi-gold) !important;
  background: #FFFBF4 !important;
}
```

**Note:** `ag-theme-quartz` (ag-grid v32+) has better CSS variable support. If upgrading, prefer it over Alpine.

## Layout

### Admin shell

```
┌─────────────────────────────────────────────────────────────┐
│  Hub header: WGI 360 | Model Portfolio | Commission | ...   │  48px, wgi-navy bg
├─────────────────────────────────────────────────────────────┤
│  Commission nav: Dashboard | Master File | Upload | ...     │  40px, white bg, gold underline active
├─────────────────────────────────────────────────────────────┤
│  [Alert banners — conditional]                              │  auto height
├─────────────────────────────────────────────────────────────┤
│  [Stat strip — 4 columns]                                   │  ~72px
├─────────────────────────────────────────────────────────────┤
│  Page content (full-width or grid)                          │  flex-1
└─────────────────────────────────────────────────────────────┘
```

- **Max width:** none on admin (full viewport — grids need it)
- **Content padding:** `20px 24px` horizontal

### IFA portal

```
┌─────────────────────────────────────────────────────────────┐
│  Hub header                                                 │
├─────────────────────────────────────────────────────────────┤
│  IFA header: name + IFA code + export buttons               │
├─────────────────────────────────────────────────────────────┤
│  Balance strip: 4 cards (Current / Suspended / Earned / Paid)│
├─────────────────────────────────────────────────────────────┤
│  Tab bar + content                                          │
└─────────────────────────────────────────────────────────────┘
```

- **Max width:** `max-w-5xl` centered (IFA portal has no grid; comfortable reading width)
- **Content padding:** `24px`

### Tab bar (shared pattern)

Identical to Model Portfolio tab bar:
- Underline tabs, not pills
- Active: `--wgi-navy` text + **3px `--wgi-gold` bottom border**
- Inactive: `--wgi-text-muted` text, transparent border
- Height: 40px, font Raleway 600 12px

### Stat strip / admin dashboard

- 4-column grid, no gap between cells (internal `border-right` dividers)
- Card padding: `16px 24px`
- **Alert card modifier:** `border-left: 3px solid --cm-alert-critical-border` for unmapped/negative-balance counts
- **Warning card modifier:** `border-left: 3px solid --cm-alert-warning-border` for pending-approval sums

### Alert banners

Stacked below the commission nav, above the stat strip. Non-blocking — page still loads.

| Level | Background | Border | When |
|-------|-----------|--------|------|
| Critical | `--cm-alert-critical-bg` | `--cm-alert-critical-border` left+bottom 1px | Unmapped policies blocking payout |
| Warning | `--cm-alert-warning-bg` | `--cm-alert-warning-border` left+bottom 1px | Negative balance IFAs |

Structure: `icon + bold label + description + [CTA button]` — CTA is white bg, current-color border, uppercase Raleway 11px.

### Dashboard charts

Two-column on `lg+` (`1fr 340px`): main bar chart left, platform pie/legend right.

```
┌──────────────────────────────┬──────────────┐
│  Top IFAs by Balance (bar)   │  By Platform  │
│                              │  (legend)     │
└──────────────────────────────┴──────────────┘
```

Chart cards: white surface, `--wgi-border` border, `border-radius: 4px`. Header: `--wgi-bg` bg, uppercase label + optional action button. Body: `16px` padding.

## Spacing

- **Base unit:** 4px
- **Density:** Compact (finance ops — maximize data on screen)
- **ag-grid row:** 32px height, 36px header
- **Table row padding:** `9px 12px`
- **Stat card padding:** `16px 24px`
- **Section content padding:** `20px 24px`
- **Chart gap:** `20px`
- **Balance card gap (IFA portal):** `12px`

| Scale | Value | Usage |
|-------|-------|-------|
| 2xs | 2px | Icon gap, inner badge padding |
| xs | 4px | Tight row gap |
| sm | 8px | Button gap, badge padding horizontal |
| md | 12px | IFA balance card gap |
| lg | 16px | Section header padding, stat card |
| xl | 20px | Content padding, chart gap |
| 2xl | 24px | Content horizontal padding |
| 3xl | 32px | Section vertical padding |

## Motion

- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Row hover:** 120ms ease-out
- **Tab underline:** 150ms ease-in-out
- **No entrance animations** on table rows or stat cards
- **Skeleton loaders** (not spinners) for data loading states — `--wgi-bg` base + `--wgi-border` shimmer
- **Modal open:** 150ms ease-out, fade + slight scale from 0.97

## Components

### CommissionLayout (shell)

```tsx
// app/commission/layout.tsx — already handles auth
// The admin secondary nav belongs in app/commission/admin/layout.tsx
```

Secondary nav implementation pattern:
```tsx
const ADMIN_TABS = [
  { href: '/commission/admin',              label: 'Dashboard' },
  { href: '/commission/admin/master-file',  label: 'Master File' },
  { href: '/commission/admin/upload',       label: 'Upload' },
  { href: '/commission/admin/approvals',    label: 'Approvals' },
  { href: '/commission/admin/payments',     label: 'Payments' },
  { href: '/commission/admin/payment-matrix', label: 'Payment Matrix' },
  { href: '/commission/admin/kpi',          label: 'KPI' },
  { href: '/commission/admin/unmapped',     label: 'Unmapped' },
  { href: '/commission/admin/audit-log',    label: 'Audit Log' },
]

// Tab: active when pathname starts with href (exact for dashboard)
// Active class: text-[var(--wgi-navy)] border-b-[3px] border-[var(--wgi-gold)]
// Inactive: text-[var(--wgi-text-muted)] border-b-transparent
```

### StatusBadge

See code in [Color > Status Badge Component](#status-badge-component) above.

Replaces inline Tailwind semantic classes in:
- `app/commission/admin/audit-log/page.tsx` — `ACTION_COLOURS` map
- `app/commission/admin/approvals/page.tsx` — status column
- `app/commission/admin/master-file/page.tsx` — status column
- `app/commission/admin/payments/page.tsx` — payment status

### AlertBanner

```tsx
// components/commission/AlertBanner.tsx
type AlertLevel = 'warning' | 'critical'

const STYLES: Record<AlertLevel, string> = {
  warning:  'bg-[var(--cm-alert-warning-bg)] border-[var(--cm-alert-warning-border)] text-[var(--cm-alert-warning-text)]',
  critical: 'bg-[var(--cm-alert-critical-bg)] border-[var(--cm-alert-critical-border)] text-[var(--cm-alert-critical-text)]',
}

export function AlertBanner({ level, children, cta, onCta, onDismiss }: Props) {
  return (
    <div className={`flex items-center gap-3 px-6 py-2.5 text-xs font-semibold border-b ${STYLES[level]}`}>
      <span>{level === 'critical' ? '⚠' : '!'}</span>
      <span>{children}</span>
      {cta && <button onClick={onCta} className="ml-auto border border-current px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider">{cta}</button>}
    </div>
  )
}
```

### StatCard

```tsx
// components/commission/StatCard.tsx
type StatVariant = 'default' | 'warning' | 'alert'

export function StatCard({ label, value, sub, variant = 'default', mono = false }: Props) {
  const borderClass = {
    default: '',
    warning: 'border-l-[3px] border-l-[var(--cm-alert-warning-border)]',
    alert:   'border-l-[3px] border-l-[var(--cm-alert-critical-border)]',
  }[variant]

  const valueColor = {
    default: 'text-[var(--wgi-navy)]',
    warning: 'text-[var(--cm-alert-warning-text)]',
    alert:   'text-[var(--cm-alert-critical-text)]',
  }[variant]

  return (
    <div className={`px-6 py-4 border-r border-[var(--wgi-border)] last:border-r-0 ${borderClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--wgi-text-muted)] mb-1">{label}</div>
      <div className={`font-bold leading-tight mb-0.5 ${valueColor} ${mono ? 'font-mono text-[18px]' : 'text-[22px]'}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--wgi-text-light)] font-medium">{sub}</div>}
    </div>
  )
}
```

### Chart color helpers

Replace the current `COLORS` constant in `app/commission/admin/page.tsx`:

```ts
// lib/commission-chart-colors.ts
export const CM_CHART_COLORS = [
  'var(--cm-chart-1)', // #1B2D45 — navy
  'var(--cm-chart-2)', // #C8A96E — gold
  'var(--cm-chart-3)', // #3D6898 — navy-400
  'var(--cm-chart-4)', // #7B96B2 — slate-blue
  'var(--cm-chart-5)', // #8C7355 — warm brown
  'var(--cm-chart-6)', // #A3B8CC — lightest blue
]

// For gain/loss in KPI charts
export const CM_GAIN = 'var(--cm-gain)' // #00873E
export const CM_LOSS = 'var(--cm-loss)' // #CC0000
```

### Audit log action badges

Replace `ACTION_COLOURS` in `audit-log/page.tsx`:

```ts
const ACTION_BADGE_CLASSES: Record<string, string> = {
  'commission.approve':       'bg-[var(--cm-status-approved-bg)]  text-[var(--cm-status-approved-text)]',
  'commission.reject':        'bg-[var(--cm-status-rejected-bg)]  text-[var(--cm-status-rejected-text)]',
  'commission.override':      'bg-[var(--cm-status-advance-bg)]   text-[var(--cm-status-advance-text)]',
  'commission.pay':           'bg-[var(--cm-status-paid-bg)]      text-[var(--cm-status-paid-text)]',
  'commission.reconcile':     'bg-[var(--cm-status-suspended-bg)] text-[var(--cm-status-suspended-text)]',
  'commission.config_update': 'bg-[var(--wgi-bg)] text-[var(--wgi-text-muted)]',
}
```

## Implementation Checklist

1. Add `--cm-*` tokens to `app/globals.css`
2. Add JetBrains Mono to commission layout (or root layout)
3. Apply ag-grid CSS variable overrides — create `app/commission/admin/master-file/ag-override.css` and import it in `master-file/page.tsx`
4. Create `components/commission/StatusBadge.tsx` — replace inline Tailwind badge classes across all commission pages
5. Create `components/commission/AlertBanner.tsx` — replace inline alert divs in `admin/page.tsx`
6. Create `components/commission/StatCard.tsx` — standardise the 4 stat cards in `admin/page.tsx`
7. Replace `COLORS` array in `admin/page.tsx` with `CM_CHART_COLORS` from `lib/commission-chart-colors.ts`
8. Replace `ACTION_COLOURS` in `audit-log/page.tsx` with `ACTION_BADGE_CLASSES` using `--cm-*` tokens
9. Wire commission secondary nav tabs into `app/commission/admin/layout.tsx`
10. IFA portal: apply `max-w-5xl` container + `ifa-balance-strip` 4-card pattern

## Anti-Patterns

- Rainbow chart colors `['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#06B6D4']` → use `--cm-chart-*`
- Tailwind semantic badge classes (`bg-green-100 text-green-800`) → use `--cm-status-*` tokens
- Red/green fill buttons for approve/reject → navy primary, white/red-text destructive
- Floating card shadows on stat cards → flat border only
- Spinner loading states → skeleton loaders
- Blue `--wgi-accent` for admin action buttons → navy `--wgi-navy` only
- Color-coded tabs or nav items by workflow type

## Preview

Design system preview: `docs/design-commission-preview.html`

Open in browser to see all three mockups (dashboard, master file, IFA portal), color tokens, typography specimen, and component library.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-22 | JetBrains Mono for monetary/ID cells | Column alignment is a financial accuracy signal; Bloomberg-grade credibility |
| 2026-06-22 | Navy ag-grid header | Signals institutional data system, not a spreadsheet |
| 2026-06-22 | Desaturated navy-gold chart palette | Replaces rainbow — charts read as designed, not defaulted |
| 2026-06-22 | No sidebar for admin nav | Commission workflows are linear (upload→approve→pay), not hierarchical |
| 2026-06-22 | `--cm-*` token prefix | Commission tokens are additive — scoped to avoid collision with WGI hub and Model Portfolio tokens |
| 2026-06-22 | Navy primary buttons (not blue) | `--wgi-accent` blue reserved for external links; navy avoids false hierarchy against chart series colors |
| 2026-06-22 | Reject = white bg + red text (not red fill) | Reject is a secondary action, not the primary CTA; red fill would over-signal danger |
| 2026-06-22 | IFA portal max-w-5xl centered | No grid — comfortable reading width for a statement-style view |
