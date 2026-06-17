/**
 * Seed script — imports Performance_Historical_model Port_WGI.csv into Supabase.
 *
 * Usage:
 *   1. Place the CSV at:  scripts/data/performance_historical.csv
 *   2. Run:               npx tsx scripts/seed-model-portfolio.ts
 *
 * The script is fully idempotent (upsert everywhere).
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// Supabase admin client (bypasses RLS)
// ---------------------------------------------------------------------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ---------------------------------------------------------------------------
// Spanish (+ English) month name → month number
// ---------------------------------------------------------------------------
const MONTH_MAP: Record<string, number> = {
  // Spanish full
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  // Spanish abbreviated
  ene: 1, feb: 2, mar: 3, abr: 4, jun: 6, jul: 7,
  ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
  // English full (some Utmost Below rows use English)
  january: 1, february: 2, march: 3, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  // English abbreviated
  jan: 1, apr: 4, aug: 8,
};

function parseMonthYear(text: string): Date | null {
  // Normalise: collapse whitespace, lowercase, remove extra chars
  const cleaned = text.trim().toLowerCase().replace(/\s+/g, " ");
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length < 2) return null;

  // Month could be first or last; year is always the numeric token
  const yearToken = parts.find((p) => /^\d{4}$/.test(p));
  if (!yearToken) return null;
  const year = parseInt(yearToken, 10);

  const monthToken = parts.find((p) => MONTH_MAP[p] !== undefined);
  if (!monthToken) return null;
  const month = MONTH_MAP[monthToken]; // 1-based

  // Return first day of that month
  return new Date(Date.UTC(year, month - 1, 1));
}

/**
 * Parse a period label like "Portafolio Modelo Junio 2020 - Marzo 2021"
 * into { startDate, endDate }.  endDate is the last day of the end month.
 */
function parsePeriodDates(
  label: string
): { startDate: string; endDate: string } | null {
  // Strip the common prefix (case-insensitive, any number of spaces)
  const stripped = label
    .replace(/^portafolio\s+modelo\s+/i, "")
    .trim();

  // Split on " - " or "–" (en-dash) or "/"
  const parts = stripped.split(/\s*[-–\/]\s*/);
  if (parts.length < 2) return null;

  const startRaw = parts[0].trim();
  const endRaw   = parts.slice(1).join("-").trim(); // re-join in case of multiple dashes

  const startDate = parseMonthYear(startRaw);
  const endDate   = parseMonthYear(endRaw);
  if (!startDate || !endDate) return null;

  // Last day of end month
  const lastDay = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 0)
  );

  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate:   lastDay.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// ISIN extractor — strips platform codes like "S234 ", "MC144S2 ", "j95 "
// ISIN format: 2 uppercase letters + 10 alphanumeric chars (12 total)
// ---------------------------------------------------------------------------
function extractISIN(raw: string): string | null {
  if (!raw) return null;
  const match = raw.match(/([A-Z]{2}[A-Z0-9]{9}[0-9])/i);
  return match ? match[1].toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------
const PLATFORM_SLUG: Record<string, string> = {
  "RL360":        "rl360",
  "FPI":          "fpi",
  "UTMOST":       "utmost",
  "Utmost Below": "utmost-below",
  "Hansard":      "hansard",
};

function profileLabel(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/Perfil\s+(A|B|C|C\+|D|D\+)/i);
  return m ? m[1].toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// CSV row type (after Papa.parse)
// ---------------------------------------------------------------------------
interface CsvRow {
  Sheet:           string;
  Period:          string;
  Profile:         string;
  Fund_Name:       string;
  ISIN:            string;
  Initial_Price:   string;
  Final_Price:     string;
  Return_Pct:      string;
  Weight:          string;
  Weighted_Return: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const csvPath = path.resolve(
    process.cwd(),
    "scripts/data/performance_historical.csv"
  );

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found at: ${csvPath}`);
    console.error(
      "Place the file at scripts/data/performance_historical.csv and re-run."
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, "utf-8");
  const { data: rows, errors } = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length) {
    console.warn(`Parse warnings (${errors.length}):`, errors.slice(0, 5));
  }

  console.log(`Parsed ${rows.length} rows`);

  // -----------------------------------------------------------------------
  // 1. Fetch static reference data (platforms + profiles already seeded via migration)
  // -----------------------------------------------------------------------
  const { data: platforms } = await supabase.from("mp_platforms").select("id, slug");
  const { data: profiles  } = await supabase.from("mp_risk_profiles").select("id, label");

  const platformBySlug = Object.fromEntries(
    (platforms ?? []).map((p) => [p.slug, p.id])
  );
  const profileByLabel = Object.fromEntries(
    (profiles ?? []).map((p) => [p.label, p.id])
  );

  // -----------------------------------------------------------------------
  // 2. Collect unique funds (by ISIN) and their per-platform aliases
  // -----------------------------------------------------------------------
  // isin → { displayName, aliases: Map<platformId, name> }
  type FundMeta = {
    displayName: string;
    aliases: Map<string, string>;
  };
  const fundMap = new Map<string, FundMeta>();

  for (const row of rows) {
    const isin       = extractISIN(row.ISIN);
    const fundName   = row.Fund_Name?.trim();
    const sheet      = row.Sheet?.trim();
    const slug       = PLATFORM_SLUG[sheet];
    const platformId = slug ? platformBySlug[slug] : undefined;

    if (!isin || !fundName || !platformId) continue;

    if (!fundMap.has(isin)) {
      fundMap.set(isin, { displayName: fundName, aliases: new Map() });
    }
    fundMap.get(isin)!.aliases.set(platformId, fundName);
  }

  console.log(`Found ${fundMap.size} unique funds`);

  // Upsert funds
  const fundRows = [...fundMap.entries()].map(([isin, meta]) => ({
    isin,
    display_name: meta.displayName,
    currency: "USD",
  }));

  const { error: fundsErr } = await supabase
    .from("mp_funds")
    .upsert(fundRows, { onConflict: "isin", ignoreDuplicates: false });
  if (fundsErr) throw new Error(`Funds upsert failed: ${fundsErr.message}`);

  // Fetch fund ids
  const { data: dbFunds } = await supabase
    .from("mp_funds")
    .select("id, isin");
  const fundIdByISIN = Object.fromEntries(
    (dbFunds ?? []).map((f) => [f.isin, f.id])
  );

  // Upsert aliases
  const aliasRows: { fund_id: string; platform_id: string; alias_name: string }[] = [];
  for (const [isin, meta] of fundMap.entries()) {
    const fundId = fundIdByISIN[isin];
    if (!fundId) continue;
    for (const [platformId, name] of meta.aliases.entries()) {
      aliasRows.push({ fund_id: fundId, platform_id: platformId, alias_name: name });
    }
  }

  const { error: aliasErr } = await supabase
    .from("mp_fund_aliases")
    .upsert(aliasRows, { onConflict: "fund_id,platform_id", ignoreDuplicates: false });
  if (aliasErr) throw new Error(`Aliases upsert failed: ${aliasErr.message}`);

  console.log(`Upserted ${aliasRows.length} fund aliases`);

  // -----------------------------------------------------------------------
  // 3. Collect unique periods per platform
  // -----------------------------------------------------------------------
  // key: `${slug}::${label}` → { platformId, label, startDate, endDate, isOpen }
  type PeriodMeta = {
    platformId: string;
    label:      string;
    startDate:  string;
    endDate:    string;
    isOpen:     boolean;
  };
  const periodMap = new Map<string, PeriodMeta>();

  for (const row of rows) {
    const sheet    = row.Sheet?.trim();
    const slug     = PLATFORM_SLUG[sheet];
    const platId   = slug ? platformBySlug[slug] : undefined;
    if (!platId || !row.Period) continue;

    const key = `${slug}::${row.Period}`;
    if (periodMap.has(key)) continue;

    const dates = parsePeriodDates(row.Period);
    if (!dates) continue;

    periodMap.set(key, {
      platformId: platId,
      label:      row.Period.trim(),
      startDate:  dates.startDate,
      endDate:    dates.endDate,
      isOpen:     false, // will update below
    });
  }

  // Mark a period as open if ANY of its holdings has no Final_Price
  for (const row of rows) {
    const sheet  = row.Sheet?.trim();
    const slug   = PLATFORM_SLUG[sheet];
    if (!slug || !row.Period) continue;
    const key = `${slug}::${row.Period}`;
    if (!periodMap.has(key)) continue;
    if (!row.Final_Price || row.Final_Price.trim() === "") {
      periodMap.get(key)!.isOpen = true;
    }
  }

  // Upsert periods
  const periodRows = [...periodMap.values()].map((p) => ({
    platform_id: p.platformId,
    label:       p.label,
    start_date:  p.startDate,
    end_date:    p.isOpen ? null : p.endDate,
    is_open:     p.isOpen,
  }));

  const { error: periodsErr } = await supabase
    .from("mp_portfolio_periods")
    .upsert(periodRows, { onConflict: "platform_id,start_date", ignoreDuplicates: false });
  if (periodsErr) throw new Error(`Periods upsert failed: ${periodsErr.message}`);

  // Fetch period ids
  const { data: dbPeriods } = await supabase
    .from("mp_portfolio_periods")
    .select("id, platform_id, start_date");

  type PeriodKey = string; // `${platformId}::${startDate}`
  const periodIdByKey = Object.fromEntries(
    (dbPeriods ?? []).map((p) => [`${p.platform_id}::${p.start_date}`, p.id])
  );

  // -----------------------------------------------------------------------
  // 4. Build holdings rows
  // -----------------------------------------------------------------------
  const holdingRows: {
    period_id:       string;
    profile_id:      string;
    fund_id:         string;
    weight:          number;
    initial_price:   number | null;
    final_price:     number | null;
    return_pct:      number | null;
    weighted_return: number | null;
  }[] = [];

  for (const row of rows) {
    const isin      = extractISIN(row.ISIN);
    const sheet     = row.Sheet?.trim();
    const slug      = PLATFORM_SLUG[sheet];
    const platId    = slug ? platformBySlug[slug] : undefined;
    const profLabel = profileLabel(row.Profile);
    const profId    = profLabel ? profileByLabel[profLabel] : undefined;

    if (!isin || !platId || !profId || !row.Period) continue;

    const fundId = fundIdByISIN[isin];
    if (!fundId) continue;

    const dates = parsePeriodDates(row.Period);
    if (!dates) continue;

    const periodKey: PeriodKey = `${platId}::${dates.startDate}`;
    const periodId = periodIdByKey[periodKey];
    if (!periodId) continue;

    const parseNum = (v: string) => {
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    };

    holdingRows.push({
      period_id:       periodId,
      profile_id:      profId,
      fund_id:         fundId,
      weight:          parseNum(row.Weight) ?? 0,
      initial_price:   parseNum(row.Initial_Price),
      final_price:     parseNum(row.Final_Price),
      return_pct:      parseNum(row.Return_Pct),
      weighted_return: parseNum(row.Weighted_Return),
    });
  }

  // Deduplicate (period_id, profile_id, fund_id) — keep last occurrence
  const holdingDedup = new Map<string, typeof holdingRows[0]>();
  for (const h of holdingRows) {
    holdingDedup.set(`${h.period_id}::${h.profile_id}::${h.fund_id}`, h);
  }
  const dedupedHoldings = [...holdingDedup.values()];

  // Batch upsert in chunks of 500
  const CHUNK = 500;
  for (let i = 0; i < dedupedHoldings.length; i += CHUNK) {
    const chunk = dedupedHoldings.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("mp_portfolio_holdings")
      .upsert(chunk, {
        onConflict: "period_id,profile_id,fund_id",
        ignoreDuplicates: false,
      });
    if (error) throw new Error(`Holdings upsert failed: ${error.message}`);
    console.log(`Holdings: upserted rows ${i + 1}–${i + chunk.length}`);
  }

  console.log(`\n✓ Seed complete`);
  console.log(`  Funds:    ${fundMap.size}`);
  console.log(`  Aliases:  ${aliasRows.length}`);
  console.log(`  Periods:  ${periodMap.size}`);
  console.log(`  Holdings: ${dedupedHoldings.length}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
