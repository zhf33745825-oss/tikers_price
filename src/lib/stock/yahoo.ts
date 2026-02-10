import YahooFinance from "yahoo-finance2";

import { parseDateKeyToDate, toDateKey } from "@/lib/stock/dates";
import { inferRegionFromExchange, inferRegionFromSymbol } from "@/lib/stock/region";

interface YahooHistoricalRow {
  date?: Date;
  close?: number | null;
  adjClose?: number | null;
  adjclose?: number | null;
  currency?: string;
}

interface YahooQuoteRow {
  shortName?: string;
  longName?: string;
  displayName?: string;
  fullExchangeName?: string;
  exchange?: string;
  market?: string;
  currency?: string;
}

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export interface FetchedHistoricalPoint {
  tradeDate: Date;
  close: number;
  adjClose: number;
  currency: string;
}

export interface QuoteMetadata {
  autoName: string | null;
  autoRegion: string | null;
  autoCurrency: string | null;
}

function resolveNameFromQuote(quote: YahooQuoteRow): string | null {
  const name = quote.displayName ?? quote.shortName ?? quote.longName;
  return typeof name === "string" && name.trim().length > 0 ? name.trim() : null;
}

function resolveRegionFromQuote(symbol: string, quote: YahooQuoteRow): string {
  const exchangeText = [
    quote.fullExchangeName,
    quote.exchange,
    quote.market,
  ]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .join(" ");

  if (exchangeText.length > 0) {
    return inferRegionFromExchange(exchangeText, symbol);
  }

  return inferRegionFromSymbol(symbol);
}

export async function fetchQuoteMetadataFromYahoo(symbol: string): Promise<QuoteMetadata> {
  const quote = (await yahooFinance.quote(symbol)) as YahooQuoteRow;

  return {
    autoName: resolveNameFromQuote(quote),
    autoRegion: resolveRegionFromQuote(symbol, quote),
    autoCurrency: typeof quote.currency === "string" && quote.currency.length > 0
      ? quote.currency
      : null,
  };
}

async function resolveCurrency(
  symbol: string,
  fallbackCurrency: string | undefined,
): Promise<string> {
  if (fallbackCurrency) {
    return fallbackCurrency;
  }

  try {
    const quoteMeta = await fetchQuoteMetadataFromYahoo(symbol);
    if (quoteMeta.autoCurrency) {
      return quoteMeta.autoCurrency;
    }
  } catch {
    // Ignore quote errors and use default currency below.
  }

  return "N/A";
}

export async function fetchHistoricalFromYahoo(
  symbol: string,
  fromDate: Date,
  toDate: Date,
): Promise<FetchedHistoricalPoint[]> {
  const rows = (await yahooFinance.historical(symbol, {
    period1: fromDate,
    period2: toDate,
    interval: "1d",
  })) as YahooHistoricalRow[];

  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const fallbackCurrency = rows.find((row) => typeof row.currency === "string")?.currency;
  const currency = await resolveCurrency(symbol, fallbackCurrency);

  const mapped = rows
    .map((row) => {
      const close = typeof row.close === "number" ? row.close : null;
      const adjClose = (() => {
        const rawAdjClose = (row as { adjClose?: number; adjclose?: number }).adjClose
          ?? (row as { adjClose?: number; adjclose?: number }).adjclose;
        if (typeof rawAdjClose === "number") {
          return rawAdjClose;
        }
        return close;
      })();

      if (!row.date || close === null || adjClose === null) {
        return null;
      }

      const dateKey = toDateKey(row.date);

      return {
        tradeDate: parseDateKeyToDate(dateKey),
        close,
        adjClose,
        currency,
      } satisfies FetchedHistoricalPoint;
    })
    .filter((row): row is FetchedHistoricalPoint => row !== null);

  mapped.sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime());

  return mapped;
}

