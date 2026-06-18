# Design System — WGI Model Portfolio

## Product Context

- **What this is:** Model Portfolio module inside Wynn Global 360 Hub — advisors compare platform risk profiles (A–D+), inspect holdings, performance history, fundamentals, and admin tooling.
- **Who it's for:** Independent financial advisors (IFAs) and WGI admins operating across Latin American platforms.
- **Space/industry:** Wealth / insurance-linked model portfolio analytics.
- **Project type:** Authenticated data dashboard (web app module).
- **Memorable thing:** Institutional trust — serious, audited data presented in a familiar finance UI.
- **Scope:** Model Portfolio module only (`app/model-portfolio/**`, `components/model-portfolio/**`).

## Design Reference

**Primary UX reference:** [Yahoo Finance My Portfolio](https://finance.yahoo.com/portfolios/) — sidebar portfolio list, headline stats, tabbed views, dense holdings table.

**Brand reference:** Wynn Global Brand Style Guide — navy `#1B2D45`, gold `#C8A96E`, Futura + Raleway, warm professional tone.

**Rule:** Yahoo Finance *layout and density*; Wynn Global *colors, typography, and tone*. Do not copy Yahoo purple branding.

## Aesthetic Direction

- **Direction:** Finance-native data UI (Yahoo-style) with Wynn brand skin
- **Decoration level:** Minimal — white/grey surfaces, no hero panels, no decorative gradients
- **Mood:** Familiar to anyone who tracks portfolios online. Dense, scannable, credible. Wynn shows up in typography, navy/gold accents, and disclaimer copy — not in heavy chrome.
- **Reference:** Yahoo Finance portfolio Summary / Holdings / Performance tabs; WGI login page for color tokens only (not layout)

## Information Architecture

Map Yahoo Finance patterns to Model Portfolio:

| Yahoo Finance | Model Portfolio |
|---------------|-----------------|
| My Portfolios sidebar | **Platforms** sidebar (Allianz, Generali, …) |
| Portfolio name + total value | Platform + profile + cumulative return |
| Day change / unrealized G/L | 1M / 3M / 6M / YTD returns in summary strip |
| Summary / Holdings / Fundamentals / Performance tabs | Same tab set on profile detail |
| Symbol + company + price + gain columns | Fund name + ISIN + weight + NAV + return + contribution |
| Green / red gain columns | Standard `#00873E` / `#CC0000` (finance convention) |
| Custom views / export | Export PDF, Compare (existing features) |

### Page types

1. **Overview** — optional: full-width platform list OR redirect into sidebar layout with first platform selected
2. **Platform + profile detail** — Yahoo two-column: platforms sidebar + main panel
3. **Compare** — side-by-side summary stats + overlaid chart (keep existing logic, restyle to match)
4. **Admin** — same tokens; denser tables OK

## Layout

- **Approach:** Yahoo two-column on `lg+`: fixed **240px** platforms sidebar + fluid main
- **Below `lg`:** sidebar collapses to horizontal platform selector or drawer
- **Max width:** `max-w-[1400px]` centered (Yahoo is wide; holdings need horizontal space)
- **Background:** `#F4F4F5` canvas, `#FFFFFF` content panels
- **No** full-width navy page headers. **No** card grids for primary navigation.

### Summary strip (below profile switcher)

Horizontal row of headline metrics (Yahoo “Total Holdings / Day Change” pattern):

- Cumulative return since inception (largest)
- 1M, 3M, 6M, YTD (secondary)
- Holdings count + last rebalance date (meta)

### Tab bar

Underline tabs, not pills:

- Tabs: **Summary** · **Holdings** · **Performance** · **Fundamentals**
- Active: navy text + **3px gold bottom border**
- Inactive: muted grey text

### Holdings table (primary UI)

- Full-width, sticky header row
- Hover row highlight `#F9FAFB`
- Left column: fund name (bold navy) + ISIN (muted, smaller)
- Numeric columns right-aligned, `tabular-nums`
- Weight column: mini bar + percentage (optional)
- Gain/loss columns: green/red bold (Yahoo convention)

## Typography

Per Wynn brand guide — **Raleway** for all UI (matches Yahoo’s clean sans density). Futura/Jost optional for logo lockup only.

| Role | Font | Size |
|------|------|------|
| Summary stat value | Raleway 700 | 22px |
| Summary stat label | Raleway 500 | 11px |
| Tab label | Raleway 600 | 13px |
| Table header | Raleway 700 | 11px uppercase |
| Table body | Raleway 500 | 13px |
| Fund name (primary cell) | Raleway 700 | 13px |
| ISIN | Raleway 500 | 11px muted |

**Loading:** Google Fonts `Raleway` weights 400–700.

## Color

### Wynn brand (unchanged)

| Token | Hex | Usage |
|-------|-----|-------|
| `--wgi-navy` | `#1B2D45` | Sidebar active accent, fund names, chart line, primary buttons |
| `--wgi-gold` | `#C8A96E` | Active tab underline, sidebar left border on selected platform |
| `--wgi-bg` | `#F4F4F5` | Page canvas (Yahoo-style light grey) |
| `--wgi-surface` | `#FFFFFF` | Main panel, table background |
| `--wgi-border` | `#E5E7EB` | Borders, table rules |
| `--wgi-text` | `#111827` | Primary text |
| `--wgi-text-muted` | `#6B7280` | Labels, ISINs |

### Finance semantic (Yahoo-aligned — not brand colors)

| Token | Hex | Usage |
|-------|-----|-------|
| `--mp-gain` | `#00873E` | Positive returns in tables and summary |
| `--mp-loss` | `#CC0000` | Negative returns |

### Links

- Default: `--wgi-navy` bold
- Hover: `--wgi-gold`
- Do **not** use `--wgi-accent` blue in this module

### Risk profiles

On profile switcher: **outline pills** — active = navy fill white text; inactive = white bg grey border. Do not use rainbow fills. Optional small color dot is OK but table/gain colors stay green/red.

## Spacing

- **Density:** Compact (Yahoo-like) — table row padding `11px 12px`
- **Summary strip gap:** 28px between stat blocks
- **Section padding:** `20px` horizontal in main panel

## Motion

- **Approach:** Minimal — row hover, tab underline only
- **Duration:** 120ms

## Components to build

| Component | Purpose |
|-----------|---------|
| `MpLayout` | Sidebar + main two-column shell |
| `MpPlatformSidebar` | Platform list with YTD return preview |
| `MpSummaryStrip` | Headline return metrics |
| `MpTabs` | Yahoo underline tabs |
| `MpHoldingsTable` | Dense finance table (refactor existing) |
| `MpProfileSwitcher` | A–D+ pill row |
| `MpPerformancePanel` | Chart + range buttons inside Performance tab |

## Implementation checklist

1. Add `--mp-gain`, `--mp-loss` to `globals.css`
2. Create `MpLayout` with sidebar; wrap `[platform]/[profile]` pages
3. Refactor profile page into tabs (move chart → Performance, holdings → Holdings tab)
4. Replace `PerformanceSummaryCards` grid with `MpSummaryStrip`
5. Restyle `HoldingsTable` to Yahoo column layout
6. Overview page: either embed sidebar layout or list platforms with YTD in sidebar style
7. Update `mp-profiles.ts` — remove rainbow `PROFILE_COLORS`; use navy pill switcher
8. Replace blue `--wgi-accent` links with navy/gold pattern
9. Load Raleway in root layout for MP routes (or globally)

## Anti-patterns

- Card grids as primary navigation
- Navy full-page headers (v1 proposal)
- Muted teal/amber performance colors
- Rainbow risk profile chips
- Generic SaaS KPI card grids (4 floating boxes)
- Purple / Yahoo branding

## Preview

Approved direction preview: `~/.gstack/projects/WGIHub/designs/model-portfolio-preview-v3-yahoo-wynn.html`

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-18 | Yahoo Finance portfolio UX + Wynn brand skin | User direction after rejecting v1/v2 generic proposals |
| 2026-06-18 | Green/red finance colors for returns | Yahoo convention; readable and familiar |
| 2026-06-18 | Raleway-only UI typography | Brand guide + matches Yahoo sans density |
| 2026-06-18 | Two-column sidebar layout | Yahoo My Portfolio pattern |
