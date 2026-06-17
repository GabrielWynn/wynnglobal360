/**
 * Yahoo Finance chart/search helpers for mutual fund daily closes and benchmarks.
 * Unofficial API — secondary fallback after FT Markets for EU fund NAVs.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface YahooPriceBar {
  date: string;
  price: number;
}

export interface YahooSymbolResolution {
  symbol: string;
  quoteType?: string;
}

export interface YahooLatestPrice {
  date:  string;
  price: number;
}

/** Map legacy benchmark tickers (e.g. GSPC.INDX, IWDA.LSE) to Yahoo symbols. */
export function toYahooSymbol(storedTicker: string): string {
  if (storedTicker.endsWith(".INDX")) {
    return `^${storedTicker.split(".")[0]}`;
  }
  if (storedTicker.endsWith(".LSE")) {
    return storedTicker.replace(/\.LSE$/, ".L");
  }
  return storedTicker;
}

let lastYahooCall = 0;

export async function yahooThrottle(minMs = 200): Promise<void> {
  const elapsed = Date.now() - lastYahooCall;
  if (elapsed < minMs) {
    await new Promise((r) => setTimeout(r, minMs - elapsed));
  }
  lastYahooCall = Date.now();
}

/** Resolve and validate a Yahoo symbol from an exchange ticker (ETF, equity, index). */
export async function resolveSymbolByTicker(ticker: string): Promise<YahooSymbolResolution | null> {
  const symbol = normalizeTickerInput(ticker);

  const latest = await getLatestPrice(symbol);
  if (latest) return { symbol, quoteType: "ETF" };

  await yahooThrottle();

  const searchUrl =
    `https://query1.finance.yahoo.com/v1/finance/search` +
    `?q=${encodeURIComponent(symbol)}&quotesCount=8&newsCount=0&listsCount=0`;

  const searchRes = await fetch(searchUrl, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!searchRes.ok) return null;

  const searchBody = (await searchRes.json()) as {
    quotes?: Array<{ symbol?: string; quoteType?: string; shortname?: string; longname?: string }>;
  };
  const quotes = searchBody.quotes ?? [];
  const exact = quotes.find((q) => q.symbol?.toUpperCase() === symbol);
  const hit =
    exact ??
    quotes.find((q) => q.symbol && /etf|equity|mutualfund/i.test(q.quoteType ?? "")) ??
    quotes.find((q) => q.symbol);

  if (!hit?.symbol) return null;
  return { symbol: hit.symbol, quoteType: hit.quoteType };
}

function normalizeTickerInput(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (upper.endsWith(".LSE")) return upper.replace(/\.LSE$/, ".L");
  return upper;
}

export async function resolveSymbolByIsin(isin: string): Promise<YahooSymbolResolution | null> {
  await yahooThrottle();

  const searchUrl =
    `https://query1.finance.yahoo.com/v1/finance/search` +
    `?q=${encodeURIComponent(isin)}&quotesCount=8&newsCount=0&listsCount=0`;

  const searchRes = await fetch(searchUrl, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!searchRes.ok) return null;

  const searchBody = (await searchRes.json()) as {
    quotes?: Array<{ symbol?: string; quoteType?: string }>;
  };
  const quotes = searchBody.quotes ?? [];
  const hit =
    quotes.find((q) => q.symbol && /mutualfund|etf|equity/i.test(q.quoteType ?? "")) ??
    quotes.find((q) => q.symbol);

  if (!hit?.symbol) return null;
  return { symbol: hit.symbol, quoteType: hit.quoteType };
}

export async function getHistoricalPrices(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<YahooPriceBar[]> {
  await yahooThrottle();

  const period1 = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000);

  const chartUrl =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&period1=${period1}&period2=${period2}`;

  const chartRes = await fetch(chartUrl, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!chartRes.ok) return [];

  const chart = (await chartRes.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };

  const result = chart.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  const bars: YahooPriceBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null || Number.isNaN(close)) continue;
    bars.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      price: close,
    });
  }

  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getLatestPrice(symbol: string): Promise<YahooLatestPrice | null> {
  const endDate   = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const bars      = await getHistoricalPrices(symbol, startDate, endDate);
  if (!bars.length) return null;
  const last = bars[bars.length - 1];
  return { date: last.date, price: last.price };
}
