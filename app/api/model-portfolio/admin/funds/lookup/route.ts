/**
 * GET  /api/model-portfolio/admin/funds/lookup?q=XX
 *      /api/model-portfolio/admin/funds/lookup?isin=XX   (legacy)
 *   → Lookup by ISIN or ETF ticker.
 *
 * POST /api/model-portfolio/admin/funds/lookup
 *   Body: { isin: string, displayName?: string }  — isin field accepts ISIN or ticker
 *   → Registers fund, resolves FT/Yahoo symbols, returns fund record.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveFtSymbol } from "@/lib/ft-markets";
import { resolveSymbolByIsin, resolveSymbolByTicker } from "@/lib/yahoo-finance";
import {
  parseFundIdentifier,
  isTickerStorageKey,
  type ParsedFundIdentifier,
} from "@/lib/fund-identifiers";

export const dynamic = "force-dynamic";

const FUND_SELECT = "id, isin, display_name, ft_symbol, yahoo_symbol";

async function findFundByIdentifier(parsed: ParsedFundIdentifier) {
  if (parsed.type === "isin") {
    return supabaseAdmin
      .from("mp_funds")
      .select(FUND_SELECT)
      .eq("isin", parsed.storageKey)
      .maybeSingle();
  }

  return supabaseAdmin
    .from("mp_funds")
    .select(FUND_SELECT)
    .or(`isin.eq.${parsed.storageKey},yahoo_symbol.ilike.${parsed.value}`)
    .maybeSingle();
}

async function resolveSymbols(parsed: ParsedFundIdentifier) {
  if (parsed.type === "ticker") {
    const yahooResolved = await resolveSymbolByTicker(parsed.value).catch(() => null);
    return { ftResolved: null, yahooResolved };
  }

  const [ftResolved, yahooResolved] = await Promise.all([
    resolveFtSymbol(parsed.value, "USD").catch(() => null),
    resolveSymbolByIsin(parsed.value).catch(() => null),
  ]);
  return { ftResolved, yahooResolved };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw =
    searchParams.get("q") ??
    searchParams.get("isin") ??
    searchParams.get("ticker");

  const parsed = parseFundIdentifier(raw);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid ISIN or ticker" }, { status: 400 });
  }

  const { data: fund } = await findFundByIdentifier(parsed);

  if (fund) {
    return NextResponse.json({
      found:      true,
      identifier: parsed.value,
      idType:     parsed.type,
      fund,
    });
  }

  const { ftResolved, yahooResolved } = await resolveSymbols(parsed);

  return NextResponse.json({
    found:      false,
    identifier: parsed.value,
    idType:     parsed.type,
    suggestion: ftResolved || yahooResolved
      ? {
          name:  ftResolved?.name ?? yahooResolved?.symbol ?? parsed.value,
          ft:    ftResolved?.symbol ?? null,
          yahoo: yahooResolved?.symbol ?? null,
        }
      : null,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const raw  = (body.isin ?? body.identifier ?? body.ticker) as string | undefined;
  const providedName = body.displayName as string | undefined;

  const parsed = parseFundIdentifier(raw);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid ISIN or ticker" }, { status: 400 });
  }

  const { data: existing } = await findFundByIdentifier(parsed);

  if (existing) {
    return NextResponse.json({ created: false, fund: existing });
  }

  const { ftResolved, yahooResolved } = await resolveSymbols(parsed);

  const defaultName =
    providedName ??
    ftResolved?.name ??
    (parsed.type === "ticker" ? parsed.value : null) ??
    parsed.value;

  const { data: fund, error } = await supabaseAdmin
    .from("mp_funds")
    .insert({
      isin:         parsed.storageKey,
      display_name: defaultName,
      currency:     "USD",
      ft_symbol:    isTickerStorageKey(parsed.storageKey) ? null : (ftResolved?.symbol ?? null),
      yahoo_symbol: yahooResolved?.symbol ?? (parsed.type === "ticker" ? parsed.value : null),
    })
    .select(FUND_SELECT)
    .maybeSingle();

  if (error || !fund) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ created: true, fund });
}
