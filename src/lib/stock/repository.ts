import { JobStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { toDateKey } from "@/lib/stock/dates";
import type { DailyUpdateResult, SymbolSeries, WatchlistItem } from "@/types/stock";

export async function countWatchSymbols(): Promise<number> {
  return prisma.watchSymbol.count();
}

export async function listWatchSymbols(enabledOnly = false): Promise<WatchlistItem[]> {
  const rows = await prisma.watchSymbol.findMany({
    where: enabledOnly ? { enabled: true } : undefined,
    orderBy: { symbol: "asc" },
  });

  return rows.map((row) => ({
    symbol: row.symbol,
    displayName: row.displayName,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function addWatchSymbol(
  symbol: string,
  displayName: string | undefined,
): Promise<WatchlistItem> {
  const row = await prisma.watchSymbol.upsert({
    where: { symbol },
    update: {
      displayName: displayName?.trim() || null,
      enabled: true,
    },
    create: {
      symbol,
      displayName: displayName?.trim() || null,
      enabled: true,
    },
  });

  return {
    symbol: row.symbol,
    displayName: row.displayName,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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

  await prisma.$transaction(
    symbols.map((symbol) =>
      prisma.watchSymbol.upsert({
        where: { symbol },
        update: {
          enabled: true,
        },
        create: {
          symbol,
          enabled: true,
        },
      }),
    ),
  );
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
