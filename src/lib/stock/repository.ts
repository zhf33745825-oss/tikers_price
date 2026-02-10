import { JobStatus, Prisma, type WatchSymbol } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { inferRegionFromSymbol } from "@/lib/stock/region";
import { toDateKey } from "@/lib/stock/dates";
import type { DailyUpdateResult, SymbolSeries, WatchlistItem } from "@/types/stock";

export interface WatchSymbolRecord {
  symbol: string;
  displayName: string | null;
  regionOverride: string | null;
  autoName: string | null;
  autoRegion: string | null;
  autoCurrency: string | null;
  metaUpdatedAt: Date | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyPriceRow {
  symbol: string;
  tradeDate: Date;
  close: number;
  adjClose: number;
  currency: string;
}

export interface LatestPriceSnapshot {
  symbol: string;
  tradeDate: Date;
  close: number;
  currency: string;
}

function resolveName(record: WatchSymbolRecord): string {
  const value = record.displayName ?? record.autoName;
  if (value && value.trim().length > 0) {
    return value.trim();
  }
  return record.symbol;
}

function resolveRegion(record: WatchSymbolRecord): string {
  const value = record.regionOverride ?? record.autoRegion;
  if (value && value.trim().length > 0) {
    return value.trim();
  }
  return inferRegionFromSymbol(record.symbol);
}

function toWatchSymbolRecord(row: WatchSymbol): WatchSymbolRecord {
  return {
    symbol: row.symbol,
    displayName: row.displayName,
    regionOverride: row.regionOverride,
    autoName: row.autoName,
    autoRegion: row.autoRegion,
    autoCurrency: row.autoCurrency,
    metaUpdatedAt: row.metaUpdatedAt,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWatchlistItem(record: WatchSymbolRecord): WatchlistItem {
  return {
    symbol: record.symbol,
    displayName: record.displayName,
    regionOverride: record.regionOverride,
    autoName: record.autoName,
    autoRegion: record.autoRegion,
    autoCurrency: record.autoCurrency,
    metaUpdatedAt: record.metaUpdatedAt ? record.metaUpdatedAt.toISOString() : null,
    resolvedName: resolveName(record),
    resolvedRegion: resolveRegion(record),
    enabled: record.enabled,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function getNextSortOrder(): Promise<number> {
  const result = await prisma.watchSymbol.aggregate({
    _max: {
      sortOrder: true,
    },
  });
  return (result._max.sortOrder ?? 0) + 1;
}

export async function countWatchSymbols(): Promise<number> {
  return prisma.watchSymbol.count();
}

export async function listWatchSymbolRecords(enabledOnly = false): Promise<WatchSymbolRecord[]> {
  const rows = await prisma.watchSymbol.findMany({
    where: enabledOnly ? { enabled: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { symbol: "asc" }],
  });

  return rows.map(toWatchSymbolRecord);
}

export async function getWatchSymbolRecordsBySymbols(
  symbols: string[],
): Promise<Map<string, WatchSymbolRecord>> {
  if (symbols.length === 0) {
    return new Map();
  }

  const rows = await prisma.watchSymbol.findMany({
    where: {
      symbol: { in: symbols },
    },
  });

  return new Map(rows.map((row) => [row.symbol, toWatchSymbolRecord(row)]));
}

export async function listWatchSymbols(enabledOnly = false): Promise<WatchlistItem[]> {
  const records = await listWatchSymbolRecords(enabledOnly);
  return records.map(toWatchlistItem);
}

export async function addWatchSymbol(
  symbol: string,
  displayName: string | undefined,
  regionOverride?: string | undefined,
): Promise<WatchlistItem> {
  const existing = await prisma.watchSymbol.findUnique({
    where: { symbol },
  });

  let row: WatchSymbol;

  if (existing) {
    const data: Prisma.WatchSymbolUpdateInput = {
      enabled: true,
    };
    if (displayName !== undefined) {
      data.displayName = displayName.trim() || null;
    }
    if (regionOverride !== undefined) {
      data.regionOverride = regionOverride.trim() || null;
    }

    row = await prisma.watchSymbol.update({
      where: { symbol },
      data,
    });
  } else {
    const sortOrder = await getNextSortOrder();
    row = await prisma.watchSymbol.create({
      data: {
        symbol,
        displayName: displayName?.trim() || null,
        regionOverride: regionOverride?.trim() || null,
        enabled: true,
        sortOrder,
      },
    });
  }

  return toWatchlistItem(toWatchSymbolRecord(row));
}

export async function updateWatchSymbolOverrides(
  symbol: string,
  payload: {
    displayName?: string | null;
    regionOverride?: string | null;
  },
): Promise<WatchlistItem> {
  const data: Prisma.WatchSymbolUpdateInput = {};
  if (payload.displayName !== undefined) {
    data.displayName = payload.displayName?.trim() || null;
  }
  if (payload.regionOverride !== undefined) {
    data.regionOverride = payload.regionOverride?.trim() || null;
  }

  const row = await prisma.watchSymbol.update({
    where: { symbol },
    data,
  });

  return toWatchlistItem(toWatchSymbolRecord(row));
}

export async function updateWatchSymbolAutoMeta(
  symbol: string,
  payload: {
    autoName: string | null;
    autoRegion: string | null;
    autoCurrency: string | null;
  },
): Promise<void> {
  await prisma.watchSymbol.update({
    where: { symbol },
    data: {
      autoName: payload.autoName,
      autoRegion: payload.autoRegion,
      autoCurrency: payload.autoCurrency,
      metaUpdatedAt: new Date(),
    },
  });
}

export async function moveWatchSymbol(
  symbol: string,
  direction: "up" | "down",
): Promise<boolean> {
  const current = await prisma.watchSymbol.findUnique({
    where: { symbol },
  });

  if (!current) {
    return false;
  }

  const neighbor = await prisma.watchSymbol.findFirst({
    where: direction === "up"
      ? { sortOrder: { lt: current.sortOrder } }
      : { sortOrder: { gt: current.sortOrder } },
    orderBy: {
      sortOrder: direction === "up" ? "desc" : "asc",
    },
  });

  if (!neighbor) {
    return false;
  }

  await prisma.$transaction([
    prisma.watchSymbol.update({
      where: { symbol: current.symbol },
      data: { sortOrder: neighbor.sortOrder },
    }),
    prisma.watchSymbol.update({
      where: { symbol: neighbor.symbol },
      data: { sortOrder: current.sortOrder },
    }),
  ]);

  return true;
}

export async function removeWatchSymbol(symbol: string): Promise<void> {
  await prisma.watchSymbol.delete({
    where: { symbol },
  });
}

export async function bulkInsertWatchSymbols(symbols: string[]): Promise<void> {
  if (symbols.length === 0) {
    return;
  }

  let nextSortOrder = await getNextSortOrder();
  for (const symbol of symbols) {
    const existing = await prisma.watchSymbol.findUnique({
      where: { symbol },
    });
    if (existing) {
      await prisma.watchSymbol.update({
        where: { symbol },
        data: {
          enabled: true,
        },
      });
      continue;
    }

    await prisma.watchSymbol.create({
      data: {
        symbol,
        enabled: true,
        sortOrder: nextSortOrder,
      },
    });
    nextSortOrder += 1;
  }
}

export async function getLastTradeDateForSymbol(symbol: string): Promise<Date | null> {
  const row = await prisma.dailyPrice.findFirst({
    where: { symbol },
    orderBy: { tradeDate: "desc" },
    select: { tradeDate: true },
  });

  return row?.tradeDate ?? null;
}

export async function upsertDailyPrices(
  symbol: string,
  points: Array<{
    tradeDate: Date;
    close: number;
    adjClose: number;
    currency: string;
  }>,
): Promise<number> {
  if (points.length === 0) {
    return 0;
  }

  const operations = points.map((point) =>
    prisma.dailyPrice.upsert({
      where: {
        symbol_tradeDate: {
          symbol,
          tradeDate: point.tradeDate,
        },
      },
      update: {
        close: new Prisma.Decimal(point.close),
        adjClose: new Prisma.Decimal(point.adjClose),
        currency: point.currency,
        fetchedAt: new Date(),
      },
      create: {
        symbol,
        tradeDate: point.tradeDate,
        close: new Prisma.Decimal(point.close),
        adjClose: new Prisma.Decimal(point.adjClose),
        currency: point.currency,
        source: "yahoo",
        fetchedAt: new Date(),
      },
    }),
  );

  await prisma.$transaction(operations);
  return points.length;
}

export async function getPriceSeries(
  symbols: string[],
  fromDate: Date,
  toDate: Date,
): Promise<SymbolSeries[]> {
  if (symbols.length === 0) {
    return [];
  }

  const rows = await prisma.dailyPrice.findMany({
    where: {
      symbol: { in: symbols },
      tradeDate: {
        gte: fromDate,
        lte: toDate,
      },
    },
    orderBy: [{ symbol: "asc" }, { tradeDate: "asc" }],
  });

  const grouped = new Map<string, SymbolSeries>();
  for (const row of rows) {
    if (!grouped.has(row.symbol)) {
      grouped.set(row.symbol, {
        symbol: row.symbol,
        currency: row.currency,
        points: [],
      });
    }

    grouped.get(row.symbol)!.points.push({
      date: toDateKey(row.tradeDate),
      close: Number(row.close.toString()),
      adjClose: Number(row.adjClose.toString()),
    });
  }

  return symbols
    .map((symbol) => grouped.get(symbol))
    .filter((series): series is SymbolSeries => Boolean(series));
}

export async function getDailyPriceRows(
  symbols: string[],
  fromDate: Date,
  toDate: Date,
): Promise<DailyPriceRow[]> {
  if (symbols.length === 0) {
    return [];
  }

  const rows = await prisma.dailyPrice.findMany({
    where: {
      symbol: { in: symbols },
      tradeDate: {
        gte: fromDate,
        lte: toDate,
      },
    },
    orderBy: [{ tradeDate: "asc" }, { symbol: "asc" }],
  });

  return rows.map((row) => ({
    symbol: row.symbol,
    tradeDate: row.tradeDate,
    close: Number(row.close.toString()),
    adjClose: Number(row.adjClose.toString()),
    currency: row.currency,
  }));
}

export async function getLatestPriceSnapshots(
  symbols: string[],
): Promise<Map<string, LatestPriceSnapshot>> {
  const snapshots = await Promise.all(
    symbols.map(async (symbol) => {
      const row = await prisma.dailyPrice.findFirst({
        where: { symbol },
        orderBy: { tradeDate: "desc" },
      });
      if (!row) {
        return null;
      }
      return {
        symbol,
        tradeDate: row.tradeDate,
        close: Number(row.close.toString()),
        currency: row.currency,
      } satisfies LatestPriceSnapshot;
    }),
  );

  return new Map(
    snapshots
      .filter((item): item is LatestPriceSnapshot => item !== null)
      .map((item) => [item.symbol, item]),
  );
}

export async function createUpdateJobLog(
  result: DailyUpdateResult,
): Promise<void> {
  await prisma.updateJobLog.create({
    data: {
      jobDate: new Date(`${result.jobDate}T00:00:00.000Z`),
      startedAt: new Date(result.startedAt),
      endedAt: new Date(result.endedAt),
      status: result.status as JobStatus,
      totalSymbols: result.totalSymbols,
      successSymbols: result.successSymbols,
      failedSymbols: result.failedSymbols,
      message: result.message,
    },
  });
}

export async function getLastSuccessfulUpdateAt(): Promise<string | null> {
  const row = await prisma.updateJobLog.findFirst({
    where: { status: JobStatus.success },
    orderBy: { endedAt: "desc" },
    select: { endedAt: true },
  });

  return row?.endedAt.toISOString() ?? null;
}

