/**
 * Model Portfolio — calculation engine (server-only)
 *
 * Handles:
 *  - Summing weighted fund returns into portfolio period returns
 *  - Chaining period returns into cumulative series (= TWR for model portfolios)
 *  - Computing standard display periods: 1M, 3M, 6M, 1Y, 2Y, YTD, Since Inception
 *  - Building chart-ready time series
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeriodReturn {
  periodId:        string;
  label:           string;
  startDate:       string;
  endDate:         string | null;
  isOpen:          boolean;
  portfolioReturn: number;       // SUM of weighted_return for period+profile
  cumulativeReturn: number;      // chained from inception
}

export interface StandardReturns {
  "1M":              number | null;
  "3M":              number | null;
  "6M":              number | null;
  "1Y":              number | null;
  "2Y":              number | null;
  "YTD":             number | null;
  "Since Inception": number | null;
}

export interface ChartPoint {
  date:            string;   // ISO date string (endDate of period)
  portfolioReturn: number;   // cumulative % as decimal e.g. 0.082
  benchmarkReturn: number | null;
}

export interface HoldingRow {
  fundId:         string;
  isin:           string;
  fundName:       string;
  weight:         number;
  initialPrice:   number | null;
  finalPrice:     number | null;
  returnPct:      number | null;
  weightedReturn: number | null;
}

// ---------------------------------------------------------------------------
// Core math
// ---------------------------------------------------------------------------

/** Chain an array of decimal period returns into a single cumulative return. */
export function chainReturns(returns: number[]): number {
  return returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
}

// ---------------------------------------------------------------------------
// Period return computation
// ---------------------------------------------------------------------------

/**
 * Given raw period rows from Supabase (each with an array of holdings),
 * compute per-period portfolio return and cumulative return series.
 *
 * rawPeriods must be ordered by start_date ASC.
 */
export function computePeriodReturns(
  rawPeriods: Array<{
    id:       string;
    label:    string;
    start_date: string;
    end_date:   string | null;
    is_open:    boolean;
    mp_portfolio_holdings: Array<{ weighted_return: number | null }>;
  }>
): PeriodReturn[] {
  const result: PeriodReturn[] = [];
  let cumulativeFactor = 1;

  for (const p of rawPeriods) {
    const holdings = p.mp_portfolio_holdings ?? [];
    const portfolioReturn = holdings.reduce(
      (sum, h) => sum + (h.weighted_return ?? 0),
      0
    );

    if (!p.is_open) {
      cumulativeFactor *= 1 + portfolioReturn;
    }

    result.push({
      periodId:         p.id,
      label:            p.label,
      startDate:        p.start_date,
      endDate:          p.end_date,
      isOpen:           p.is_open,
      portfolioReturn,
      cumulativeReturn: cumulativeFactor - 1,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Standard period returns
// ---------------------------------------------------------------------------

/**
 * Computes 1M, 3M, 6M, 1Y, 2Y, YTD, and Since Inception returns from
 * the array of period returns (only completed periods are used).
 */
export function computeStandardReturns(
  periods: PeriodReturn[],
  referenceDate: Date = new Date()
): StandardReturns {
  const completed = periods.filter((p) => !p.isOpen);

  /** Returns portfolio returns for all periods whose end_date >= cutoff. */
  function getReturnsFrom(cutoff: Date): number[] {
    return completed
      .filter((p) => p.endDate && new Date(p.endDate) >= cutoff)
      .map((p) => p.portfolioReturn);
  }

  function monthsAgo(n: number): Date {
    const d = new Date(referenceDate);
    d.setMonth(d.getMonth() - n);
    return d;
  }

  const compute = (months: number): number | null => {
    const returns = getReturnsFrom(monthsAgo(months));
    return returns.length ? chainReturns(returns) : null;
  };

  const ytdCutoff = new Date(referenceDate.getFullYear(), 0, 1);
  const ytdReturns = getReturnsFrom(ytdCutoff);

  return {
    "1M":              compute(1),
    "3M":              compute(3),
    "6M":              compute(6),
    "1Y":              compute(12),
    "2Y":              compute(24),
    "YTD":             ytdReturns.length ? chainReturns(ytdReturns) : null,
    "Since Inception": completed.length
      ? chainReturns(completed.map((p) => p.portfolioReturn))
      : null,
  };
}

// ---------------------------------------------------------------------------
// Chart series builder
// ---------------------------------------------------------------------------

/**
 * Builds a chart-ready array using completed periods.
 * benchmark prices keyed by date string ("YYYY-MM-DD") → price.
 * Benchmark return is computed as price appreciation from the very first
 * benchmark date that aligns with inception.
 */
export function buildChartSeries(
  periods: PeriodReturn[],
  benchmarkPrices: Map<string, number> | null
): ChartPoint[] {
  const completed = periods.filter((p) => !p.isOpen && p.endDate);

  // Resolve benchmark start price (price at the start of the first period)
  let benchmarkStartPrice: number | null = null;
  if (benchmarkPrices && completed.length) {
    const firstStart = completed[0].startDate;
    benchmarkStartPrice = findNearestPrice(benchmarkPrices, firstStart);
  }

  return completed.map((p) => {
    let benchmarkReturn: number | null = null;

    if (benchmarkPrices && benchmarkStartPrice && p.endDate) {
      const endPrice = findNearestPrice(benchmarkPrices, p.endDate);
      if (endPrice !== null) {
        benchmarkReturn = endPrice / benchmarkStartPrice - 1;
      }
    }

    return {
      date:            p.endDate!,
      portfolioReturn: p.cumulativeReturn,
      benchmarkReturn,
    };
  });
}

/**
 * Finds the price in the map on or nearest to (searching back up to 7 days)
 * the given date string.
 */
function findNearestPrice(
  prices: Map<string, number>,
  dateStr: string
): number | null {
  const base = new Date(dateStr);
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(base);
    d.setDate(d.getDate() - offset);
    const key = d.toISOString().slice(0, 10);
    if (prices.has(key)) return prices.get(key)!;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Formatting helpers (used by both server and client)
// ---------------------------------------------------------------------------

export function formatReturn(value: number | null, decimals = 2): string {
  if (value === null) return "—";
  const pct = (value * 100).toFixed(decimals);
  return value >= 0 ? `+${pct}%` : `${pct}%`;
}

export function returnColor(value: number | null): string {
  if (value === null) return "var(--wgi-text-muted)";
  return value >= 0 ? "#10b981" : "#ef4444";
}
