/**
 * Fund identifier helpers — ISIN (mutual funds) and exchange tickers (ETFs).
 * Ticker-only funds are stored with isin = `TICKER:{symbol}` in mp_funds.
 */

export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** Yahoo-style symbols: VOO, IWDA.L, ^GSPC, BRK-B */
export const TICKER_RE = /^(\^?[A-Z0-9][A-Z0-9.\-]{0,14})$/;

export const TICKER_STORAGE_PREFIX = "TICKER:";

export type FundIdentifierType = "isin" | "ticker";

export interface ParsedFundIdentifier {
  type:        FundIdentifierType;
  /** Normalized value (ISIN or ticker symbol) */
  value:       string;
  /** Value stored in mp_funds.isin */
  storageKey:  string;
}

export function normalizeTickerInput(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (upper.endsWith(".LSE")) return upper.replace(/\.LSE$/, ".L");
  return upper;
}

export function tickerStorageKey(ticker: string): string {
  return `${TICKER_STORAGE_PREFIX}${normalizeTickerInput(ticker)}`;
}

export function isTickerStorageKey(stored: string): boolean {
  return stored.startsWith(TICKER_STORAGE_PREFIX);
}

/** Display label for UI (strip TICKER: prefix). */
export function formatFundIdentifier(stored: string): string {
  if (isTickerStorageKey(stored)) return stored.slice(TICKER_STORAGE_PREFIX.length);
  return stored;
}

export function parseFundIdentifier(raw: string | null | undefined): ParsedFundIdentifier | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (ISIN_RE.test(upper)) {
    return { type: "isin", value: upper, storageKey: upper };
  }

  const ticker = normalizeTickerInput(trimmed);
  if (TICKER_RE.test(ticker)) {
    return { type: "ticker", value: ticker, storageKey: tickerStorageKey(ticker) };
  }

  return null;
}

export function isValidFundIdentifier(raw: string): boolean {
  return parseFundIdentifier(raw) !== null;
}
