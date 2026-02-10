import YahooFinance from "yahoo-finance2";

import { parseDateKeyToDate, toDateKey } from "@/lib/stock/dates";

interface YahooHistoricalRow {
  date?: Date;
  close?: number | null;
  adjClose?: number | null;
  adjclose?: number | null;
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

async function resolveCurrency(
  symbol: string,
  fallbackCurrency: string | undefined,
): Promise<string> {
  if (fallbackCurrency) {
    return fallbackCurrency;
  }

  try {
    const quote = (await yahooFinance.quote(symbol)) as { currency?: string };
    if (typeof quote.currency === "string" && quote.currency.length > 0) {
      return quote.currency;
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
