import { toErrorMessage } from "@/lib/stock/errors";
import {
  getTradeDateBoundsBySymbols,
  type TradeDateBounds,
  upsertDailyPrices,
} from "@/lib/stock/repository";
import { fetchHistoricalFromYahooWithResolution } from "@/lib/stock/yahoo";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_COOLDOWN_MS = 10 * 60 * 1000;
const EMPTY_SEED_RESULT_RETRY_COOLDOWN_MS = 2 * 60 * 1000;
const FAILED_REFRESH_RETRY_COOLDOWN_MS = 30 * 1000;

export interface TailRefreshWindow {
  fromDate: Date;
  toDate: Date;
}

interface AsyncTailRefreshInput {
  symbols: string[];
  fromDate: Date;
  toDate: Date;
  source: "matrix" | "query";
  force?: boolean;
  strategy?: {
    recentSeedLookbackDays?: number;
    backfillLookbackDays?: number;
  };
}

const symbolNextRefreshAllowedAt = new Map<string, number>();
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
  const nextAllowedAt = symbolNextRefreshAllowedAt.get(symbol);
  if (!nextAllowedAt) {
    return false;
  }

  return nowMs < nextAllowedAt;
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
  options?: {
    recentSeedLookbackDays?: number;
  },
): TailRefreshWindow | null {
  if (fromDate.getTime() > toDate.getTime()) {
    return null;
  }

  if (!bounds) {
    const recentSeedLookbackDays = Math.max(0, Math.floor(options?.recentSeedLookbackDays ?? 0));
    if (recentSeedLookbackDays > 0) {
      const seededFromDate = shiftDays(toDate, -(recentSeedLookbackDays - 1));
      return normalizeWindowForFetch({
        fromDate: seededFromDate.getTime() > fromDate.getTime() ? seededFromDate : fromDate,
        toDate,
      });
    }

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

export function buildRefreshWindows(
  fromDate: Date,
  toDate: Date,
  bounds: TradeDateBounds | undefined,
  options?: {
    recentSeedLookbackDays?: number;
    backfillLookbackDays?: number;
  },
): TailRefreshWindow[] {
  if (fromDate.getTime() > toDate.getTime()) {
    return [];
  }

  if (!bounds) {
    const seedWindow = buildTailRefreshWindow(fromDate, toDate, undefined, {
      recentSeedLookbackDays: options?.recentSeedLookbackDays,
    });
    if (!seedWindow) {
      return [];
    }

    const windows: TailRefreshWindow[] = [seedWindow];
    const backfillWindow = buildBackfillWindowAfterSeed(
      fromDate,
      toDate,
      seedWindow,
      {
        backfillLookbackDays: options?.backfillLookbackDays,
      },
    );
    if (backfillWindow) {
      windows.push(backfillWindow);
    }
    return windows;
  }

  const windows: TailRefreshWindow[] = [];
  if (fromDate.getTime() < bounds.minTradeDate.getTime()) {
    const frontWindow = normalizeWindowForFetch({
      fromDate,
      toDate: shiftDays(bounds.minTradeDate, -1),
    });
    if (frontWindow.fromDate.getTime() <= frontWindow.toDate.getTime()) {
      windows.push(frontWindow);
    }
  }

  const tailWindow = buildTailRefreshWindow(fromDate, toDate, bounds);
  if (tailWindow) {
    windows.push(tailWindow);
  }

  return windows;
}

function buildBackfillWindowAfterSeed(
  fromDate: Date,
  toDate: Date,
  seededWindow: TailRefreshWindow,
  options?: {
    backfillLookbackDays?: number;
  },
): TailRefreshWindow | null {
  const backfillLookbackDays = Math.max(0, Math.floor(options?.backfillLookbackDays ?? 0));
  if (backfillLookbackDays <= 0) {
    return null;
  }

  const targetBackfillFrom = shiftDays(toDate, -(backfillLookbackDays - 1));
  const backfillFrom = targetBackfillFrom.getTime() > fromDate.getTime() ? targetBackfillFrom : fromDate;
  const backfillTo = shiftDays(seededWindow.fromDate, -1);

  if (backfillFrom.getTime() > backfillTo.getTime()) {
    return null;
  }

  return normalizeWindowForFetch({
    fromDate: backfillFrom,
    toDate: backfillTo,
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
    if (symbolRefreshInFlight.has(symbol) || (!input.force && shouldSkipByCooldown(symbol, nowMs))) {
      continue;
    }

    const symbolBounds = boundsBySymbol.get(symbol);
    const refreshWindows = buildRefreshWindows(
      input.fromDate,
      input.toDate,
      symbolBounds,
      {
        recentSeedLookbackDays: input.strategy?.recentSeedLookbackDays,
        backfillLookbackDays: input.strategy?.backfillLookbackDays,
      },
    );
    if (refreshWindows.length === 0) {
      continue;
    }

    triggeredSymbols.push(symbol);
    const hadLocalData = Boolean(symbolBounds);

    const refreshPromise = (async () => {
      let totalPoints = 0;
      let failed = false;
      try {
        for (const [index, window] of refreshWindows.entries()) {
          const historical = await fetchHistoricalFromYahooWithResolution(
            symbol,
            window.fromDate,
            window.toDate,
          );
          totalPoints += historical.points.length;
          if (historical.points.length > 0) {
            await upsertDailyPrices(symbol, historical.points);
          }
          const stage = !symbolBounds
            ? (index === 0 ? "seed" : "backfill")
            : (index === 0 && refreshWindows.length > 1 ? "frontfill" : "tailfill");
          logDev(
            `[async-refresh-result] source=${input.source} stage=${stage} source-symbol=${symbol} resolved-symbol=${historical.resolvedSymbol} result-points=${historical.points.length}`,
          );
        }
      } catch (error) {
        failed = true;
        logDevError(
          `[async-refresh-error] source=${input.source} symbol=${symbol} message=${toErrorMessage(error)}`,
        );
      } finally {
        const cooldownMs = failed
          ? FAILED_REFRESH_RETRY_COOLDOWN_MS
          : (!hadLocalData && totalPoints === 0)
            ? EMPTY_SEED_RESULT_RETRY_COOLDOWN_MS
            : DEFAULT_REFRESH_COOLDOWN_MS;

        symbolNextRefreshAllowedAt.set(symbol, Date.now() + cooldownMs);
        symbolRefreshInFlight.delete(symbol);
      }
    })();

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
  symbolNextRefreshAllowedAt.clear();
  symbolRefreshInFlight.clear();
  schedulerRuns.clear();
}
