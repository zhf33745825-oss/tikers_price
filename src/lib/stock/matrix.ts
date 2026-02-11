import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import { appEnv } from "@/lib/env";
import { scheduleAsyncTailRefreshForSymbols } from "@/lib/stock/cache-hydration";
import { ensureDefaultWatchlist } from "@/lib/stock/bootstrap";
import { MATRIX_PRESET_DAYS, META_REFRESH_DAYS, SHANGHAI_TIME_ZONE } from "@/lib/stock/constants";
import { buildDateRange, parseDateKeyToDate, toDateKey } from "@/lib/stock/dates";
import { InputError } from "@/lib/stock/errors";
import { inferRegionFromSymbol } from "@/lib/stock/region";
import {
  getDailyPriceRows,
  getLatestPriceSnapshots,
  getWatchSymbolRecordsBySymbols,
  listWatchSymbolRecords,
  updateWatchSymbolAutoMeta,
  type WatchSymbolRecord,
} from "@/lib/stock/repository";
import { parseSymbolsInput } from "@/lib/stock/symbols";
import { fetchQuoteMetadataFromYahoo } from "@/lib/stock/yahoo";
import type { MatrixMode, MatrixPreset, MatrixPriceResponse } from "@/types/stock";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface MatrixQueryInput {
  mode?: string | null;
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  symbols?: string | null;
}

interface RangeSelection {
  preset: MatrixPreset;
  pullFromDate: Date;
  pullToDate: Date;
  fallbackFrom: string;
  fallbackTo: string;
}

interface ResolvedSymbolMeta {
  name: string;
  region: string;
  autoCurrency: string | null;
}

function logDevError(message: string): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(message);
  }
}

function parseMode(rawMode: string | null | undefined): MatrixMode {
  if (!rawMode || rawMode === "watchlist") {
    return "watchlist";
  }
  if (rawMode === "adhoc") {
    return "adhoc";
  }
  throw new InputError("mode must be watchlist or adhoc");
}

function parsePreset(rawPreset: string | null | undefined): MatrixPreset {
  if (!rawPreset || rawPreset === "30") {
    return "30";
  }
  if (rawPreset === "7" || rawPreset === "90" || rawPreset === "custom") {
    return rawPreset;
  }
  throw new InputError("preset must be 7, 30, 90, or custom");
}

function shouldRefreshMeta(record: WatchSymbolRecord, now: dayjs.Dayjs): boolean {
  if (!record.metaUpdatedAt) {
    return true;
  }
  if (!record.autoName || !record.autoRegion || !record.autoCurrency) {
    return true;
  }
  return now.diff(dayjs(record.metaUpdatedAt), "day") >= META_REFRESH_DAYS;
}

function resolveName(record: WatchSymbolRecord | undefined, fallbackSymbol: string): string {
  const value = record?.displayName ?? record?.autoName;
  if (value && value.trim().length > 0) {
    return value.trim();
  }
  return fallbackSymbol;
}

function resolveRegion(record: WatchSymbolRecord | undefined, fallbackSymbol: string): string {
  const value = record?.regionOverride ?? record?.autoRegion;
  if (value && value.trim().length > 0) {
    return value.trim();
  }
  return inferRegionFromSymbol(fallbackSymbol);
}

function buildRangeSelection(
  preset: MatrixPreset,
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
): RangeSelection {
  const today = dayjs().tz(SHANGHAI_TIME_ZONE).endOf("day");

  if (preset === "custom") {
    if (!fromRaw || !toRaw) {
      throw new InputError("from and to are required when preset=custom");
    }
    const range = buildDateRange(fromRaw, toRaw);
    return {
      preset,
      pullFromDate: range.fromDate,
      pullToDate: range.toDate,
      fallbackFrom: range.from,
      fallbackTo: range.to,
    };
  }

  const pullFrom = today.subtract(2, "year").startOf("day");
  return {
    preset,
    pullFromDate: pullFrom.toDate(),
    pullToDate: today.toDate(),
    fallbackFrom: pullFrom.format("YYYY-MM-DD"),
    fallbackTo: today.format("YYYY-MM-DD"),
  };
}

async function resolveWatchlistMeta(
  watchRecords: WatchSymbolRecord[],
): Promise<Map<string, ResolvedSymbolMeta>> {
  const now = dayjs().tz(SHANGHAI_TIME_ZONE);
  const metaMap = new Map<string, ResolvedSymbolMeta>();

  for (const record of watchRecords) {
    let activeRecord = record;
    if (shouldRefreshMeta(record, now)) {
      try {
        const quoteMeta = await fetchQuoteMetadataFromYahoo(record.symbol);
        await updateWatchSymbolAutoMeta(record.symbol, quoteMeta);
        activeRecord = {
          ...record,
          autoName: quoteMeta.autoName,
          autoRegion: quoteMeta.autoRegion,
          autoCurrency: quoteMeta.autoCurrency,
          metaUpdatedAt: new Date(),
        };
      } catch (error) {
        logDevError(
          `[meta-refresh-error] symbol=${record.symbol} message=${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }

    metaMap.set(record.symbol, {
      name: resolveName(activeRecord, record.symbol),
      region: resolveRegion(activeRecord, record.symbol),
      autoCurrency: activeRecord.autoCurrency,
    });
  }

  return metaMap;
}

async function resolveAdhocMeta(
  symbols: string[],
  watchRecordMap: Map<string, WatchSymbolRecord>,
): Promise<Map<string, ResolvedSymbolMeta>> {
  const now = dayjs().tz(SHANGHAI_TIME_ZONE);
  const metaMap = new Map<string, ResolvedSymbolMeta>();

  for (const symbol of symbols) {
    const watchRecord = watchRecordMap.get(symbol);

    if (watchRecord) {
      let activeRecord = watchRecord;
      if (shouldRefreshMeta(watchRecord, now)) {
        try {
          const quoteMeta = await fetchQuoteMetadataFromYahoo(symbol);
          await updateWatchSymbolAutoMeta(symbol, quoteMeta);
          activeRecord = {
            ...watchRecord,
            autoName: quoteMeta.autoName,
            autoRegion: quoteMeta.autoRegion,
            autoCurrency: quoteMeta.autoCurrency,
            metaUpdatedAt: new Date(),
          };
        } catch (error) {
          logDevError(
            `[meta-refresh-error] symbol=${symbol} message=${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }

      metaMap.set(symbol, {
        name: resolveName(activeRecord, symbol),
        region: resolveRegion(activeRecord, symbol),
        autoCurrency: activeRecord.autoCurrency,
      });
      continue;
    }

    try {
      const quoteMeta = await fetchQuoteMetadataFromYahoo(symbol);
      metaMap.set(symbol, {
        name: quoteMeta.autoName ?? symbol,
        region: quoteMeta.autoRegion ?? inferRegionFromSymbol(symbol),
        autoCurrency: quoteMeta.autoCurrency,
      });
    } catch (error) {
      logDevError(
        `[meta-refresh-error] symbol=${symbol} message=${error instanceof Error ? error.message : "unknown error"}`,
      );
      metaMap.set(symbol, {
        name: symbol,
        region: inferRegionFromSymbol(symbol),
        autoCurrency: null,
      });
    }
  }

  return metaMap;
}

function selectTradeDates(
  preset: MatrixPreset,
  allDateKeys: string[],
): string[] {
  const ordered = (() => {
    if (preset === "custom") {
      return allDateKeys;
    }
    const take = MATRIX_PRESET_DAYS[preset];
    if (allDateKeys.length <= take) {
      return allDateKeys;
    }
    return allDateKeys.slice(-take);
  })();

  return [...ordered].reverse();
}

export async function getMatrixPriceData(
  input: MatrixQueryInput,
): Promise<MatrixPriceResponse> {
  const warnings: string[] = [];
  const mode = parseMode(input.mode);
  const preset = parsePreset(input.preset);
  const rangeSelection = buildRangeSelection(preset, input.from, input.to);

  let symbols: string[] = [];
  let watchRecords: WatchSymbolRecord[] = [];
  let watchRecordMap = new Map<string, WatchSymbolRecord>();

  if (mode === "watchlist") {
    await ensureDefaultWatchlist();
    watchRecords = await listWatchSymbolRecords(true);
    symbols = watchRecords.map((item) => item.symbol);
    watchRecordMap = new Map(watchRecords.map((item) => [item.symbol, item]));
  } else {
    symbols = parseSymbolsInput(input.symbols ?? "", appEnv.maxQuerySymbols);
    watchRecordMap = await getWatchSymbolRecordsBySymbols(symbols);
  }

  if (symbols.length === 0) {
    return {
      mode,
      range: {
        from: rangeSelection.fallbackFrom,
        to: rangeSelection.fallbackTo,
        preset,
      },
      dates: [],
      displayDates: [],
      rows: [],
      warnings: ["no symbols available"],
    };
  }

  const [priceRows, latestSnapshots, metaMap] = await Promise.all([
    getDailyPriceRows(symbols, rangeSelection.pullFromDate, rangeSelection.pullToDate),
    getLatestPriceSnapshots(symbols),
    mode === "watchlist"
      ? resolveWatchlistMeta(watchRecords)
      : resolveAdhocMeta(symbols, watchRecordMap),
  ]);

  const allDateKeys = Array.from(new Set(priceRows.map((row) => toDateKey(row.tradeDate)))).sort();
  const selectedDateKeys = selectTradeDates(preset, allDateKeys);

  if (selectedDateKeys.length === 0) {
    warnings.push("no trade-day prices found in selected range");
  }

  const selectedDateSet = new Set(selectedDateKeys);
  const selectedPriceRows = priceRows.filter((row) => selectedDateSet.has(toDateKey(row.tradeDate)));

  const symbolToDatePrice = new Map<string, Map<string, number>>();
  for (const row of selectedPriceRows) {
    const dateKey = toDateKey(row.tradeDate);
    if (!symbolToDatePrice.has(row.symbol)) {
      symbolToDatePrice.set(row.symbol, new Map<string, number>());
    }
    symbolToDatePrice.get(row.symbol)!.set(dateKey, row.close);
  }

  const orderedSymbols = mode === "watchlist"
    ? watchRecords.map((item) => item.symbol)
    : symbols;

  const rows = orderedSymbols.map((symbol) => {
    const pricesByDate: Record<string, number | null> = {};
    const datePriceMap = symbolToDatePrice.get(symbol);

    for (const dateKey of selectedDateKeys) {
      pricesByDate[dateKey] = datePriceMap?.get(dateKey) ?? null;
    }

    const snapshot = latestSnapshots.get(symbol);
    const meta = metaMap.get(symbol) ?? {
      name: symbol,
      region: inferRegionFromSymbol(symbol),
      autoCurrency: null,
    };

    return {
      symbol,
      name: meta.name,
      region: meta.region,
      currency: snapshot?.currency ?? meta.autoCurrency ?? "N/A",
      latestClose: snapshot?.close ?? null,
      pricesByDate,
    };
  });

  if (process.env.NODE_ENV === "development") {
    console.info(
      `[db-hit] source=matrix symbols=${symbols.length} rows=${priceRows.length}`,
    );
  }

  scheduleAsyncTailRefreshForSymbols({
    source: "matrix",
    symbols,
    fromDate: rangeSelection.pullFromDate,
    toDate: rangeSelection.pullToDate,
  });

  const from = selectedDateKeys[selectedDateKeys.length - 1] ?? rangeSelection.fallbackFrom;
  const to = selectedDateKeys[0] ?? rangeSelection.fallbackTo;

  return {
    mode,
    range: {
      from,
      to,
      preset,
    },
    dates: selectedDateKeys,
    displayDates: selectedDateKeys.map((dateKey) =>
      dayjs(parseDateKeyToDate(dateKey)).tz(SHANGHAI_TIME_ZONE).format("YY.MM.DD")),
    rows,
    warnings: Array.from(new Set(warnings)),
  };
}
