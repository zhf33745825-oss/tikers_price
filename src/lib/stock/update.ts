import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import { DAILY_UPDATE_LOOKBACK_YEARS, SHANGHAI_TIME_ZONE } from "@/lib/stock/constants";
import { ensureDefaultWatchlist } from "@/lib/stock/bootstrap";
import {
  createUpdateJobLog,
  getLastTradeDateForSymbol,
  listWatchSymbols,
  upsertDailyPrices,
} from "@/lib/stock/repository";
import { fetchHistoricalFromYahoo } from "@/lib/stock/yahoo";
import type { DailyUpdateResult } from "@/types/stock";

dayjs.extend(utc);
dayjs.extend(timezone);

export async function retryWithBackoff<T>(
  task: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 400,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        break;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

async function updateSingleSymbol(symbol: string, now: Date): Promise<number> {
  const lastTradeDate = await getLastTradeDateForSymbol(symbol);

  const fromDate = lastTradeDate
    ? dayjs(lastTradeDate).add(1, "day").startOf("day").toDate()
    : dayjs(now).subtract(DAILY_UPDATE_LOOKBACK_YEARS, "year").startOf("day").toDate();
  const toDate = dayjs(now).endOf("day").toDate();

  if (fromDate.getTime() > toDate.getTime()) {
    return 0;
  }

  const points = await fetchHistoricalFromYahoo(symbol, fromDate, toDate);
  if (points.length === 0) {
    return 0;
  }

  return upsertDailyPrices(symbol, points);
}

export async function runDailyUpdate(now = new Date()): Promise<DailyUpdateResult> {
  await ensureDefaultWatchlist();

  const startedAt = new Date();
  const watchlist = await listWatchSymbols(true);
  const failures: Array<{ symbol: string; error: string }> = [];
  let successSymbols = 0;
  let failedSymbols = 0;
  let upsertedRows = 0;
  let noOpSymbols = 0;

  for (const item of watchlist) {
    try {
      const updatedRows = await retryWithBackoff(
        () => updateSingleSymbol(item.symbol, now),
        3,
        500,
      );
      successSymbols += 1;
      upsertedRows += updatedRows;
      if (updatedRows === 0) {
        noOpSymbols += 1;
      }
    } catch (error) {
      failedSymbols += 1;
      failures.push({
        symbol: item.symbol,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const endedAt = new Date();
  const status: DailyUpdateResult["status"] = (() => {
    if (failedSymbols === 0) {
      return "success";
    }
    if (successSymbols === 0) {
      return "failed";
    }
    return "partial";
  })();

  const message = (() => {
    if (watchlist.length === 0) {
      return "watchlist-empty";
    }
    if (status === "success" && noOpSymbols === watchlist.length) {
      return "success(no-op)";
    }
    if (status === "partial") {
      return "partial-success";
    }
    if (status === "failed") {
      return "all-failed";
    }
    return "success";
  })();

  const result: DailyUpdateResult = {
    jobDate: dayjs(now).tz(SHANGHAI_TIME_ZONE).format("YYYY-MM-DD"),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    status,
    totalSymbols: watchlist.length,
    successSymbols,
    failedSymbols,
    upsertedRows,
    message,
    failures,
  };

  await createUpdateJobLog(result);
  return result;
}

