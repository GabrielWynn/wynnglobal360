/**
 * Shared FT Markets → Yahoo Finance price fetch for model-portfolio funds.
 */

import { supabaseAdmin } from "@/lib/supabase";
import {
  resolveFtSymbol,
  getFtHistoricalPrices,
  ftThrottle,
} from "@/lib/ft-markets";
import {
  resolveSymbolByIsin,
  resolveSymbolByTicker,
  getHistoricalPrices as getYahooHistoricalPrices,
} from "@/lib/yahoo-finance";
import { isTickerStorageKey, formatFundIdentifier } from "@/lib/fund-identifiers";

export interface FundPriceSourceFields {
  id:       string;
  isin:     string;
  currency: string;
  ft_symbol:    string | null;
  yahoo_symbol: string | null;
}

export interface FundPriceBar {
  date:   string;
  price:  number;
  source: "ft" | "yahoo";
}

export async function fetchFundPriceHistory(
  fund: FundPriceSourceFields,
  startDate: string,
  endDate: string
): Promise<FundPriceBar[]> {
  const tickerOnly = isTickerStorageKey(fund.isin);

  if (!tickerOnly) {
    let ftSymbol = fund.ft_symbol;
    if (!ftSymbol) {
      const resolved = await resolveFtSymbol(fund.isin, fund.currency);
      if (resolved) {
        ftSymbol = resolved.symbol;
        await supabaseAdmin.from("mp_funds").update({ ft_symbol: ftSymbol }).eq("id", fund.id);
        await ftThrottle();
      }
    }

    if (ftSymbol) {
      const bars = await getFtHistoricalPrices(ftSymbol, startDate, endDate);
      if (bars.length) {
        return bars.map((b) => ({ date: b.date, price: b.price, source: "ft" as const }));
      }
    }
  }

  let yahooSymbol = fund.yahoo_symbol;
  if (!yahooSymbol) {
    const resolved = tickerOnly
      ? await resolveSymbolByTicker(formatFundIdentifier(fund.isin))
      : await resolveSymbolByIsin(fund.isin);
    if (resolved) {
      yahooSymbol = resolved.symbol;
      await supabaseAdmin.from("mp_funds").update({ yahoo_symbol: yahooSymbol }).eq("id", fund.id);
    }
  }

  if (!yahooSymbol && tickerOnly) {
    yahooSymbol = formatFundIdentifier(fund.isin);
  }

  if (!yahooSymbol) return [];

  const bars = await getYahooHistoricalPrices(yahooSymbol, startDate, endDate);
  return bars.map((b) => ({ date: b.date, price: b.price, source: "yahoo" as const }));
}
