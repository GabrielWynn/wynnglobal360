# Wynn Global 360 Hub — Agent Notes

## Design System

### Model Portfolio (`app/model-portfolio/**`, `components/model-portfolio/**`)

Always read `DESIGN.md` before making any visual or UI decisions in the Model Portfolio module.

All font choices, colors, spacing, and aesthetic direction are defined there. Do not deviate without explicit user approval.

In QA mode, flag any Model Portfolio code that doesn't match `DESIGN.md`.

### Commission (`app/commission/**`, `components/commission/**`)

Always read `DESIGN-COMMISSION.md` before making any visual or UI decisions in the Commission module.

Key rules:
- Use `--cm-*` CSS tokens for status badges, alert banners, and chart colors — never raw Tailwind semantic classes (`bg-green-100`, etc.)
- Use `--wgi-navy` for primary buttons, not `--wgi-accent` blue
- Use JetBrains Mono for all monetary values and policy/IFA identifiers
- The ag-grid master file must use the CSS variable overrides defined in `DESIGN-COMMISSION.md`
- Replace the `COLORS` rainbow array in `admin/page.tsx` with `CM_CHART_COLORS` from `lib/commission-chart-colors.ts`

In QA mode, flag any Commission code that doesn't match `DESIGN-COMMISSION.md`.
