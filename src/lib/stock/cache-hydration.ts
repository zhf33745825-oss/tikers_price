import { toErrorMessage } from "@/lib/stock/errors";
import {
  getTradeDateBoundsBySymbols,
  type TradeDateBounds,
  upsertDailyPrices,
} from "@/lib/stock/repository";
import { fetchHistoricalFromYahoo } from "@/lib/stock/yahoo";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MissingRangeWindow {
  fromDate: Date;
  toDate: Date;
}

interface HydrateHistoricalCacheInput {
  symbols: string[];
  fromDate: Date;
  toDate: Date;
  warnings: string[];
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * DAY_MS));
}

function normalizeWindowForFetch(window: MissingRangeWindow): MissingRangeWindow {
  if (window.toDate.getTime() > window.fromDate.getTime()) {
    return window;
  }

  // yahoo-finance2 rejects requests where period1 and period2 are identical.
  return {
    fromDate: window.fromDate,
    toDate: shiftDays(window.toDate, 1),
  };
}

export function buildMissingWindowsForRange(
  fromDate: Date,
  toDate: Date,
  bounds: TradeDateBounds | undefined,
): MissingRangeWindow[] {
  if (fromDate.getTime() > toDate.getTime()) {
    return [];
  }

  if (!bounds) {
    return [{ fromDate, toDate }];
  }

  const windows: MissingRangeWindow[] = [];
  const requestStart = fromDate.getTime();
  const requestEnd = toDate.getTime();
  const localMin = bounds.minTradeDate.getTime();
  const localMax = bounds.maxTradeDate.getTime();

  if (requestStart < localMin) {
    const gapEnd = shiftDays(bounds.minTradeDate, -1);
    if (requestStart <= gapEnd.getTime()) {
      windows.push({
        fromDate,
        toDate: gapEnd,
      });
    }
  }

  if (localMax < requestEnd) {
    const gapStart = shiftDays(bounds.maxTradeDate, 1);
    if (gapStart.getTime() <= requestEnd) {
      windows.push({
        fromDate: gapStart,
        toDate,
      });
    }
  }

  return windows;
}

export async function hydrateHistoricalCacheForSymbols(
  input: HydrateHistoricalCacheInput,
): Promise<void> {
  if (input.symbols.length === 0) {
    return;
  }

  const boundsBySymbol = await getTradeDateBoundsBySymbols(input.symbols);

  for (const symbol of input.symbols) {
    const bounds = boundsBySymbol.get(symbol);
    const missingWindows = buildMissingWindowsForRange(input.fromDate, input.toDate, bounds);

    for (const window of missingWindows) {
      const fetchWindow = normalizeWindowForFetch(window);
      try {
        const points = await fetchHistoricalFromYahoo(
          symbol,
          fetchWindow.fromDate,
          fetchWindow.toDate,
        );
        if (points.length > 0) {
          await upsertDailyPrices(symbol, points);
        }
      } catch (error) {
        input.warnings.push(
          `${symbol}: failed to fetch missing historical data (${toErrorMessage(error)})`,
        );
        break;
      }
    }
  }
}
