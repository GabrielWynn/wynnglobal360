/**
 * FT Markets (markets.ft.com) client — primary price source for EU fund NAVs.
 *
 * Uses the undocumented AJAX endpoint discovered on fund tearsheet pages:
 *   GET /data/equities/ajax/getHistoricalPrices?symbol={ftSymbol}&startDate=&endDate=
 *
 * Internal symbol ids are cached on mp_funds.ft_symbol after first resolution.
 */

const FT_BASE = "https://markets.ft.com/data/funds/tearsheet/historical";
const FT_AJAX = "https://markets.ft.com/data/equities/ajax/getHistoricalPrices";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CURRENCY_FALLBACKS = ["USD", "GBP", "EUR"] as const;

export interface FtPriceBar {
  date:  string; // YYYY-MM-DD
  price: number;
}

export interface FtResolveResult {
  symbol:   string;
  currency: string;
  name?:    string;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseFtDate(label: string): string | null {
  const d = new Date(label.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Parse Close column from FT historical-prices AJAX HTML payload. */
export function parseFtHistoricalHtml(html: string): FtPriceBar[] {
  const rows: FtPriceBar[] = [];
  const rowRe =
    /<tr>[\s\S]*?mod-ui-hide-small-below">([^<]+)<\/span>[\s\S]*?<td>([\d.]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td><td>([\d.]+)<\/td>/g;

  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const date = parseFtDate(m[1]);
    const close = parseFloat(m[5]);
    if (!date || Number.isNaN(close)) continue;
    rows.push({ date, price: close });
  }

  // Newest first on FT — sort ascending for upsert convenience
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

async function fetchTearsheetHtml(isin: string, currency: string): Promise<string | null> {
  const url = `${FT_BASE}?s=${encodeURIComponent(isin)}:${encodeURIComponent(currency)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

/** Extract FT internal symbol + fund name from tearsheet HTML. */
export function extractFtSymbolFromHtml(html: string): { symbol: string; name?: string } | null {
  const cfgMatch = html.match(
    /mod-tearsheet-historical-prices[^>]*data-mod-config="([^"]+)"/
  );
  if (!cfgMatch) return null;

  let json: { symbol?: string };
  try {
    json = JSON.parse(decodeHtml(cfgMatch[1])) as { symbol?: string };
  } catch {
    return null;
  }
  if (!json.symbol) return null;

  const nameMatch = html.match(
    /mod-tearsheet-overview__header__name[^>]*>([^<]+)</
  );
  return {
    symbol: json.symbol,
    name:   nameMatch?.[1]?.trim(),
  };
}

/**
 * Resolve ISIN → FT internal symbol. Tries fund currency then USD/GBP/EUR.
 */
export async function resolveFtSymbol(
  isin: string,
  preferredCurrency = "USD"
): Promise<FtResolveResult | null> {
  const tried = new Set<string>();
  const order = [preferredCurrency, ...CURRENCY_FALLBACKS].filter((c) => {
    if (tried.has(c)) return false;
    tried.add(c);
    return true;
  });

  for (const currency of order) {
    const html = await fetchTearsheetHtml(isin, currency);
    if (!html) continue;
    const extracted = extractFtSymbolFromHtml(html);
    if (extracted) {
      return { symbol: extracted.symbol, currency, name: extracted.name };
    }
  }
  return null;
}

/**
 * Fetch historical NAV rows for a cached FT symbol id.
 */
export async function getFtHistoricalPrices(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<FtPriceBar[]> {
  const params = new URLSearchParams({
    symbol:    symbol,
    startDate: startDate,
    endDate:   endDate,
  });
  const url = `${FT_AJAX}?${params}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { html?: string };
    if (!body.html) return [];
    return parseFtHistoricalHtml(body.html);
  } catch {
    return [];
  }
}

export function dateDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Polite delay between FT requests (ms). */
export function ftThrottle(ms = 350): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
