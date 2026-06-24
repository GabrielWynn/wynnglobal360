/**

 * Price coverage audit for active portfolio funds.

 * Shared by the admin API route and the CLI script.

 */



import { supabaseAdmin } from "@/lib/supabase";



export type CoverageStatus =

  | "ok"                  // recent price from FT or Yahoo

  | "stale"               // has prices but older than threshold

  | "empty"               // no prices at all

  | "no_source"           // no FT/Yahoo symbol and no recent price

  | "yahoo_only";         // has recent price via Yahoo fallback only



export interface CoverageFundRow {

  fundId:       string;

  isin:         string;

  name:         string;

  currency:     string;

  hasFtSymbol:    boolean;

  hasYahooSymbol: boolean;

  platforms:    string[];

  firstPrice:   string | null;

  lastPrice:    string | null;

  rows:         number;

  lastSource:   string | null;

  status:       CoverageStatus;

}



export interface CoverageAuditSummary {

  activeFunds:        number;

  ok:                 number;

  stale:              number;

  empty:              number;

  noSource:           number;

  yahooOnly:          number;

  fallbackTargets:    number;

  auditedAt:          string;

}



export interface CoverageAuditResult {

  summary: CoverageAuditSummary;

  funds:   CoverageFundRow[];

}



function businessDaysAgo(n: number): string {

  const d = new Date();

  let count = 0;

  while (count < n) {

    d.setDate(d.getDate() - 1);

    const day = d.getDay();

    if (day !== 0 && day !== 6) count++;

  }

  return d.toISOString().slice(0, 10);

}



export async function runPriceCoverageAudit(): Promise<CoverageAuditResult> {

  const today          = new Date().toISOString().slice(0, 10);

  const staleThreshold = businessDaysAgo(5);



  const { data: activeComps } = await supabaseAdmin

    .from("mp_portfolio_compositions")

    .select(`

      id, platform_id, profile_id,

      mp_platforms(name),

      mp_risk_profiles(label),

      mp_composition_holdings(

        fund_id,

        mp_funds(id, isin, display_name, currency, ft_symbol, yahoo_symbol)

      )

    `)

    .is("effective_to", null);



  type FundEntry = {

    fundId:         string;

    isin:           string;

    name:           string;

    currency:       string;

    hasFtSymbol:    boolean;

    hasYahooSymbol: boolean;

    platforms:      string[];

  };



  const fundMap = new Map<string, FundEntry>();



  for (const comp of activeComps ?? []) {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const platName  = ((comp as any).mp_platforms as { name: string } | null)?.name ?? "?";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const profLabel = ((comp as any).mp_risk_profiles as { label: string } | null)?.label ?? "?";

    const label     = `${platName} / ${profLabel}`;



    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    for (const h of (comp as any).mp_composition_holdings ?? []) {

      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      const fund = Array.isArray(h.mp_funds) ? h.mp_funds[0] : h.mp_funds as any;

      if (!fund) continue;



      const fundId = h.fund_id as string;

      const entry  = fundMap.get(fundId);

      if (!entry) {

        fundMap.set(fundId, {

          fundId,

          isin:           fund.isin,

          name:           fund.display_name,

          currency:       fund.currency ?? "USD",

          hasFtSymbol:    !!fund.ft_symbol,

          hasYahooSymbol: !!fund.yahoo_symbol,

          platforms:      [label],

        });

      } else if (!entry.platforms.includes(label)) {

        entry.platforms.push(label);

      }

    }

  }



  const activeFundIds = [...fundMap.keys()];

  if (!activeFundIds.length) {

    return {

      summary: {

        activeFunds: 0, ok: 0, stale: 0, empty: 0, noSource: 0,

        yahooOnly: 0, fallbackTargets: 0, auditedAt: today,

      },

      funds: [],

    };

  }



  const { data: priceRows } = await supabaseAdmin

    .from("mp_fund_prices")

    .select("fund_id, date, source")

    .in("fund_id", activeFundIds)

    .order("date", { ascending: false });



  const statsMap = new Map<

    string,

    { first: string; last: string; count: number; lastSource: string | null }

  >();



  for (const row of priceRows ?? []) {

    const fid = row.fund_id as string;

    const ex  = statsMap.get(fid);

    if (!ex) {

      statsMap.set(fid, {

        first:      row.date,

        last:       row.date,

        count:      1,

        lastSource: row.source as string | null,

      });

    } else {

      if (row.date < ex.first) ex.first = row.date;

      if (row.date > ex.last) {

        ex.last       = row.date;

        ex.lastSource = row.source as string | null;

      }

      ex.count++;

    }

  }



  const hasSource = (f: FundEntry) => f.hasFtSymbol || f.hasYahooSymbol;



  const funds: CoverageFundRow[] = [...fundMap.values()].map((f) => {

    const stats = statsMap.get(f.fundId);

    let status: CoverageStatus = "empty";



    if (!stats) {

      status = hasSource(f) ? "empty" : "no_source";

    } else if (stats.last >= staleThreshold) {

      status = stats.lastSource === "yahoo" && !f.hasFtSymbol ? "yahoo_only" : "ok";

    } else {

      status = hasSource(f) ? "stale" : "no_source";

    }



    return {

      fundId:         f.fundId,

      isin:           f.isin,

      name:           f.name,

      currency:       f.currency,

      hasFtSymbol:    f.hasFtSymbol,

      hasYahooSymbol: f.hasYahooSymbol,

      platforms:      f.platforms.sort(),

      firstPrice:     stats?.first ?? null,

      lastPrice:      stats?.last  ?? null,

      rows:           stats?.count ?? 0,

      lastSource:     stats?.lastSource ?? null,

      status,

    };

  });



  const order: Record<CoverageStatus, number> = {

    no_source: 0, empty: 1, stale: 2, yahoo_only: 3, ok: 4,

  };

  funds.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));



  const summary: CoverageAuditSummary = {

    activeFunds:       funds.length,

    ok:                funds.filter((f) => f.status === "ok").length,

    stale:             funds.filter((f) => f.status === "stale").length,

    empty:             funds.filter((f) => f.status === "empty").length,

    noSource:          funds.filter((f) => f.status === "no_source").length,

    yahooOnly:         funds.filter((f) => f.status === "yahoo_only").length,

    fallbackTargets:   funds.filter(

      (f) => f.status === "no_source" || f.status === "empty" || f.status === "stale"

    ).length,

    auditedAt: today,

  };



  return { summary, funds };

}


