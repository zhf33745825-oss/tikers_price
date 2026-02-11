import { toErrorMessage } from "@/lib/stock/errors";
import {
  getTradeDateBoundsBySymbols,
  type TradeDateBounds,
  upsertDailyPrices,
} from "@/lib/stock/repository";
import { fetchHistoricalFromYahooWithResolution } from "@/lib/stock/yahoo";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

export interface TailRefreshWindow {
  fromDate: Date;
  toDate: Date;
}

interface AsyncTailRefreshInput {
  symbols: string[];
  fromDate: Date;
  toDate: Date;
  source: "matrix" | "query";
}

const symbolLastRefreshAt = new Map<string, number>();
const symbolRefreshInFlight = new Map<string, Promise<void>>();
const schedulerRuns = new Set<Promise<void>>();

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * DAY_MS));
}

function normalizeWindowForFetch(window: TailRefreshWindow): TailRefreshWindow {
  if (window.toDate.getTime() > window.fromDate.getTime()) {
    return window;
  }

  // Yahoo chart endpoint is more stable when period2 is after period1.
  return {
    fromDate: window.fromDate,
    toDate: shiftDays(window.toDate, 1),
  };
}

function shouldSkipByCooldown(symbol: string, nowMs: number): boolean {
  const lastTriggeredAt = symbolLastRefreshAt.get(symbol);
  if (!lastTriggeredAt) {
    return false;
  }

  return nowMs - lastTriggeredAt < DEFAULT_REFRESH_COOLDOWN_MS;
}

function logDev(message: string): void {
  if (process.env.NODE_ENV === "development") {
    console.info(message);
  }
}

function logDevError(message: string): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(message);
  }
}

export function buildTailRefreshWindow(
  fromDate: Date,
  toDate: Date,
  bounds: TradeDateBounds | undefined,
): TailRefreshWindow | null {
  if (fromDate.getTime() > toDate.getTime()) {
    return null;
  }

  if (!bounds) {
    return normalizeWindowForFetch({ fromDate, toDate });
  }

  const requestEnd = toDate.getTime();
  const localMax = bounds.maxTradeDate.getTime();
  if (localMax >= requestEnd) {
    return null;
  }

  const refreshStart = shiftDays(bounds.maxTradeDate, 1);
  if (refreshStart.getTime() > requestEnd) {
    return null;
  }

  return normalizeWindowForFetch({
    fromDate: refreshStart,
    toDate,
  });
}

async function runAsyncTailRefresh(
  input: AsyncTailRefreshInput,
): Promise<void> {
  if (input.symbols.length === 0) {
    return;
  }

  const nowMs = Date.now();
  const boundsBySymbol = await getTradeDateBoundsBySymbols(input.symbols);
  const triggeredSymbols: string[] = [];

  for (const symbol of input.symbols) {
    if (symbolRefreshInFlight.has(symbol) || shouldSkipByCooldown(symbol, nowMs)) {
      continue;
    }

    const refreshWindow = buildTailRefreshWindow(input.fromDate, input.toDate, boundsBySymbol.get(symbol));
    if (!refreshWindow) {
      continue;
    }

    symbolLastRefreshAt.set(symbol, nowMs);
    triggeredSymbols.push(symbol);

    const refreshPromise = (async () => {
      try {
        const historical = await fetchHistoricalFromYahooWithResolution(
          symbol,
          refreshWindow.fromDate,
          refreshWindow.toDate,
        );
        if (historical.points.length > 0) {
          await upsertDailyPrices(symbol, historical.points);
        }
        logDev(
          `[async-refresh-result] source=${input.source} source-symbol=${symbol} resolved-symbol=${historical.resolvedSymbol} result-points=${historical.points.length}`,
        );
      } catch (error) {
        logDevError(
          `[async-refresh-error] source=${input.source} symbol=${symbol} message=${toErrorMessage(error)}`,
        );
      }
    })().finally(() => {
      symbolRefreshInFlight.delete(symbol);
    });

    symbolRefreshInFlight.set(symbol, refreshPromise);
  }

  logDev(
    `[async-refresh-triggered] source=${input.source} symbols=${triggeredSymbols.join(",") || "none"}`,
  );
}

export function scheduleAsyncTailRefreshForSymbols(
  input: AsyncTailRefreshInput,
): void {
  const runPromise = runAsyncTailRefresh(input)
    .catch((error) => {
      logDevError(
        `[async-refresh-error] source=${input.source} scheduler=${toErrorMessage(error)}`,
      );
    });
  schedulerRuns.add(runPromise);
  void runPromise.finally(() => {
    schedulerRuns.delete(runPromise);
  });
}

export async function waitForAsyncTailRefreshForTests(): Promise<void> {
  await Promise.all(Array.from(schedulerRuns));
  await Promise.all(Array.from(symbolRefreshInFlight.values()));
}

export function resetAsyncTailRefreshStateForTests(): void {
  symbolLastRefreshAt.clear();
  symbolRefreshInFlight.clear();
  schedulerRuns.clear();
}
