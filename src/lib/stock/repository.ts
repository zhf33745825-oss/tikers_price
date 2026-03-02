import {
  JobStatus,
  Prisma,
  type WatchSymbol,
  type Watchlist,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { DEFAULT_WATCHLIST_NAME } from "@/lib/stock/constants";
import { toDateKey } from "@/lib/stock/dates";
import { InputError } from "@/lib/stock/errors";
import { inferRegionFromSymbol } from "@/lib/stock/region";
import type {
  DailyUpdateResult,
  SymbolSuggestion,
  SymbolSeries,
  WatchlistItem,
  WatchlistSummary,
} from "@/types/stock";

type WatchlistWithCount = Prisma.WatchlistGetPayload<{
  include: {
    _count: {
      select: {
        members: true;
      };
    };
  };
}>;

type WatchlistMemberWithSymbol = Prisma.WatchlistMemberGetPayload<{
  include: {
    watchSymbol: true;
  };
}>;

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

export interface WatchlistSummaryRecord {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  symbolCount: number;
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

export interface TradeDateBounds {
  minTradeDate: Date;
  maxTradeDate: Date;
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

function toWatchSymbolRecordFromMember(row: WatchlistMemberWithSymbol): WatchSymbolRecord {
  const symbolRow = row.watchSymbol;
  return {
    symbol: symbolRow.symbol,
    displayName: symbolRow.displayName,
    regionOverride: symbolRow.regionOverride,
    autoName: symbolRow.autoName,
    autoRegion: symbolRow.autoRegion,
    autoCurrency: symbolRow.autoCurrency,
    metaUpdatedAt: symbolRow.metaUpdatedAt,
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

function toWatchlistSummaryRecord(row: WatchlistWithCount): WatchlistSummaryRecord {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    isDefault: row.isDefault,
    symbolCount: row._count.members,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWatchlistSummary(record: WatchlistSummaryRecord): WatchlistSummary {
  return {
    id: record.id,
    name: record.name,
    sortOrder: record.sortOrder,
    isDefault: record.isDefault,
    symbolCount: record.symbolCount,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toLocalSymbolSuggestion(record: WatchSymbolRecord): SymbolSuggestion {
  return {
    symbol: record.symbol,
    name: resolveName(record),
    exchange: null,
    region: resolveRegion(record),
    type: "LOCAL",
  };
}

async function getNextDeprecatedWatchSymbolSortOrder(): Promise<number> {
  const result = await prisma.watchSymbol.aggregate({
    _max: {
      sortOrder: true,
    },
  });
  return (result._max.sortOrder ?? 0) + 1;
}

async function getNextWatchlistSortOrder(): Promise<number> {
  const result = await prisma.watchlist.aggregate({
    _max: {
      sortOrder: true,
    },
  });
  return (result._max.sortOrder ?? 0) + 1;
}

async function getNextWatchlistMemberSortOrder(watchlistId: string): Promise<number> {
  const result = await prisma.watchlistMember.aggregate({
    where: {
      watchlistId,
    },
    _max: {
      sortOrder: true,
    },
  });
  return (result._max.sortOrder ?? 0) + 1;
}

async function compactWatchlistMemberSortOrders(watchlistId: string): Promise<void> {
  const rows = await prisma.watchlistMember.findMany({
    where: { watchlistId },
    include: {
      watchSymbol: {
        select: {
          symbol: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }],
  });

  rows.sort((a, b) => {
    if (a.sortOrder === b.sortOrder) {
      return a.watchSymbol.symbol.localeCompare(b.watchSymbol.symbol);
    }
    return a.sortOrder - b.sortOrder;
  });

  const updates = rows.flatMap((row, index) => {
    const nextSortOrder = index + 1;
    if (row.sortOrder === nextSortOrder) {
      return [];
    }

    return [
      prisma.watchlistMember.update({
        where: { id: row.id },
        data: { sortOrder: nextSortOrder },
      }),
    ];
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

async function ensureDefaultWatchlistRecord(): Promise<WatchlistSummaryRecord> {
  const existingDefault = await prisma.watchlist.findFirst({
    where: { isDefault: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          members: true,
        },
      },
    },
  });
  if (existingDefault) {
    return toWatchlistSummaryRecord(existingDefault);
  }

  const first = await prisma.watchlist.findFirst({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          members: true,
        },
      },
    },
  });
  if (first) {
    await prisma.$transaction([
      prisma.watchlist.updateMany({
        data: {
          isDefault: false,
        },
      }),
      prisma.watchlist.update({
        where: {
          id: first.id,
        },
        data: {
          isDefault: true,
        },
      }),
    ]);
    return {
      ...toWatchlistSummaryRecord(first),
      isDefault: true,
    };
  }

  return createWatchlist(DEFAULT_WATCHLIST_NAME);
}

async function getOrCreateWatchSymbol(
  symbol: string,
  displayName?: string | undefined,
  regionOverride?: string | undefined,
): Promise<WatchSymbol> {
  const existing = await prisma.watchSymbol.findUnique({
    where: { symbol },
  });

  if (existing) {
    const data: Prisma.WatchSymbolUpdateInput = {};
    if (displayName !== undefined) {
      data.displayName = displayName.trim() || null;
    }
    if (regionOverride !== undefined) {
      data.regionOverride = regionOverride.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    return prisma.watchSymbol.update({
      where: { symbol },
      data,
    });
  }

  const deprecatedSortOrder = await getNextDeprecatedWatchSymbolSortOrder();
  return prisma.watchSymbol.create({
    data: {
      symbol,
      displayName: displayName?.trim() || null,
      regionOverride: regionOverride?.trim() || null,
      enabled: true,
      sortOrder: deprecatedSortOrder,
    },
  });
}

export async function countWatchSymbols(): Promise<number> {
  return prisma.watchSymbol.count();
}

export async function countWatchlists(): Promise<number> {
  return prisma.watchlist.count();
}

export async function countWatchlistMembers(): Promise<number> {
  return prisma.watchlistMember.count();
}

export async function listWatchlists(): Promise<WatchlistSummary[]> {
  const rows = await prisma.watchlist.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          members: true,
        },
      },
    },
  });

  return rows.map((row) => toWatchlistSummary(toWatchlistSummaryRecord(row)));
}

export async function getWatchlistById(listId: string): Promise<WatchlistSummary | null> {
  const row = await prisma.watchlist.findUnique({
    where: { id: listId },
    include: {
      _count: {
        select: {
          members: true,
        },
      },
    },
  });
  if (!row) {
    return null;
  }
  return toWatchlistSummary(toWatchlistSummaryRecord(row));
}

export async function getDefaultWatchlist(): Promise<WatchlistSummary | null> {
  const row = await prisma.watchlist.findFirst({
    where: { isDefault: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          members: true,
        },
      },
    },
  });

  if (!row) {
    return null;
  }

  return toWatchlistSummary(toWatchlistSummaryRecord(row));
}

export async function createWatchlist(name: string): Promise<WatchlistSummaryRecord> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new InputError("watchlist name is required");
  }

  const [sortOrder, count] = await Promise.all([
    getNextWatchlistSortOrder(),
    countWatchlists(),
  ]);

  const row = await prisma.watchlist.create({
    data: {
      name: trimmedName,
      sortOrder,
      isDefault: count === 0,
    },
    include: {
      _count: {
        select: {
          members: true,
        },
      },
    },
  });

  return toWatchlistSummaryRecord(row);
}

export async function renameWatchlist(
  listId: string,
  name: string,
): Promise<WatchlistSummaryRecord | null> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new InputError("watchlist name is required");
  }

  const existing = await prisma.watchlist.findUnique({
    where: { id: listId },
  });
  if (!existing) {
    return null;
  }

  const row = await prisma.watchlist.update({
    where: { id: listId },
    data: {
      name: trimmedName,
    },
    include: {
      _count: {
        select: {
          members: true,
        },
      },
    },
  });

  return toWatchlistSummaryRecord(row);
}

export async function setDefaultWatchlist(
  listId: string,
): Promise<WatchlistSummaryRecord | null> {
  const target = await prisma.watchlist.findUnique({
    where: { id: listId },
    include: {
      _count: {
        select: {
          members: true,
        },
      },
    },
  });
  if (!target) {
    return null;
  }

  await prisma.$transaction([
    prisma.watchlist.updateMany({
      data: {
        isDefault: false,
      },
    }),
    prisma.watchlist.update({
      where: { id: listId },
      data: {
        isDefault: true,
      },
    }),
  ]);

  return {
    ...toWatchlistSummaryRecord(target),
    isDefault: true,
  };
}

export async function deleteWatchlist(listId: string): Promise<{
  deleted: boolean;
  nextDefaultListId: string | null;
}> {
  const watchlists = await prisma.watchlist.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      isDefault: true,
      sortOrder: true,
      name: true,
    },
  });

  const target = watchlists.find((item) => item.id === listId);
  if (!target) {
    return {
      deleted: false,
      nextDefaultListId: null,
    };
  }

  if (watchlists.length <= 1) {
    throw new InputError("cannot delete the last watchlist");
  }

  const fallback = target.isDefault
    ? watchlists.find((item) => item.id !== listId) ?? null
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.watchlist.delete({
      where: { id: listId },
    });

    if (fallback) {
      await tx.watchlist.updateMany({
        data: {
          isDefault: false,
        },
      });
      await tx.watchlist.update({
        where: { id: fallback.id },
        data: {
          isDefault: true,
        },
      });
    }
  });

  return {
    deleted: true,
    nextDefaultListId: fallback?.id ?? null,
  };
}

export async function listWatchlistMemberRecords(
  listId: string,
  enabledOnly = false,
): Promise<WatchSymbolRecord[]> {
  const rows = await prisma.watchlistMember.findMany({
    where: {
      watchlistId: listId,
      ...(enabledOnly ? { enabled: true } : {}),
    },
    include: {
      watchSymbol: true,
    },
    orderBy: [{ sortOrder: "asc" }],
  });

  rows.sort((a, b) => {
    if (a.sortOrder === b.sortOrder) {
      return a.watchSymbol.symbol.localeCompare(b.watchSymbol.symbol);
    }
    return a.sortOrder - b.sortOrder;
  });

  return rows.map(toWatchSymbolRecordFromMember);
}

export async function listWatchlistMembers(
  listId: string,
  enabledOnly = false,
): Promise<WatchlistItem[]> {
  const records = await listWatchlistMemberRecords(listId, enabledOnly);
  return records.map(toWatchlistItem);
}

export async function listEnabledSymbolsByWatchlistId(listId: string): Promise<string[]> {
  const records = await listWatchlistMemberRecords(listId, true);
  return records.map((record) => record.symbol);
}

export async function listDistinctEnabledSymbolsAcrossWatchlists(): Promise<string[]> {
  const rows = await prisma.watchlistMember.findMany({
    where: {
      enabled: true,
    },
    include: {
      watchSymbol: {
        select: {
          symbol: true,
        },
      },
    },
    orderBy: [{ watchlistId: "asc" }, { sortOrder: "asc" }],
  });

  const seen = new Set<string>();
  const symbols: string[] = [];
  for (const row of rows) {
    const symbol = row.watchSymbol.symbol;
    if (seen.has(symbol)) {
      continue;
    }
    seen.add(symbol);
    symbols.push(symbol);
  }

  return symbols;
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

export async function searchLocalWatchSymbols(
  query: string,
  limit: number,
): Promise<SymbolSuggestion[]> {
  const normalizedQuery = query.trim().toUpperCase();
  if (!normalizedQuery) {
    return [];
  }

  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const candidateRows = await prisma.watchSymbol.findMany({
    where: {
      OR: [
        { symbol: { contains: normalizedQuery } },
        { displayName: { contains: query.trim() } },
        { autoName: { contains: query.trim() } },
      ],
    },
    take: safeLimit * 4,
    orderBy: [{ updatedAt: "desc" }],
  });

  const seen = new Set<string>();
  const ranked = candidateRows
    .map((row) => toWatchSymbolRecord(row))
    .filter((row) => {
      if (seen.has(row.symbol)) {
        return false;
      }
      seen.add(row.symbol);
      return true;
    })
    .sort((a, b) => {
      const aStarts = a.symbol.startsWith(normalizedQuery) ? 0 : 1;
      const bStarts = b.symbol.startsWith(normalizedQuery) ? 0 : 1;
      if (aStarts !== bStarts) {
        return aStarts - bStarts;
      }
      return a.symbol.localeCompare(b.symbol);
    })
    .slice(0, safeLimit);

  return ranked.map(toLocalSymbolSuggestion);
}

export async function addSymbolToWatchlist(
  listId: string,
  symbol: string,
  displayName: string | undefined,
  regionOverride?: string | undefined,
): Promise<WatchlistItem> {
  const watchSymbol = await getOrCreateWatchSymbol(symbol, displayName, regionOverride);

  const existingMember = await prisma.watchlistMember.findUnique({
    where: {
      watchlistId_watchSymbolId: {
        watchlistId: listId,
        watchSymbolId: watchSymbol.id,
      },
    },
    include: {
      watchSymbol: true,
    },
  });

  if (existingMember) {
    const row = existingMember.enabled
      ? existingMember
      : await prisma.watchlistMember.update({
        where: {
          watchlistId_watchSymbolId: {
            watchlistId: listId,
            watchSymbolId: watchSymbol.id,
          },
        },
        data: {
          enabled: true,
        },
        include: {
          watchSymbol: true,
        },
      });
    return toWatchlistItem(toWatchSymbolRecordFromMember(row));
  }

  const sortOrder = await getNextWatchlistMemberSortOrder(listId);
  const row = await prisma.watchlistMember.create({
    data: {
      watchlistId: listId,
      watchSymbolId: watchSymbol.id,
      enabled: true,
      sortOrder,
    },
    include: {
      watchSymbol: true,
    },
  });

  return toWatchlistItem(toWatchSymbolRecordFromMember(row));
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

export async function moveWatchlistMember(
  listId: string,
  symbol: string,
  direction: "up" | "down",
): Promise<boolean> {
  const watchSymbol = await prisma.watchSymbol.findUnique({
    where: { symbol },
    select: { id: true },
  });
  if (!watchSymbol) {
    return false;
  }

  const current = await prisma.watchlistMember.findUnique({
    where: {
      watchlistId_watchSymbolId: {
        watchlistId: listId,
        watchSymbolId: watchSymbol.id,
      },
    },
  });

  if (!current) {
    return false;
  }

  const neighbor = await prisma.watchlistMember.findFirst({
    where: {
      watchlistId: listId,
      ...(direction === "up"
        ? { sortOrder: { lt: current.sortOrder } }
        : { sortOrder: { gt: current.sortOrder } }),
    },
    orderBy: {
      sortOrder: direction === "up" ? "desc" : "asc",
    },
  });

  if (!neighbor) {
    return false;
  }

  await prisma.$transaction([
    prisma.watchlistMember.update({
      where: { id: current.id },
      data: { sortOrder: neighbor.sortOrder },
    }),
    prisma.watchlistMember.update({
      where: { id: neighbor.id },
      data: { sortOrder: current.sortOrder },
    }),
  ]);

  return true;
}

export async function removeSymbolFromWatchlist(
  listId: string,
  symbol: string,
): Promise<boolean> {
  const watchSymbol = await prisma.watchSymbol.findUnique({
    where: { symbol },
    select: { id: true },
  });
  if (!watchSymbol) {
    return false;
  }

  const result = await prisma.watchlistMember.deleteMany({
    where: {
      watchlistId: listId,
      watchSymbolId: watchSymbol.id,
    },
  });

  if (result.count > 0) {
    await compactWatchlistMemberSortOrders(listId);
    return true;
  }

  return false;
}

export async function listWatchSymbolRecords(enabledOnly = false): Promise<WatchSymbolRecord[]> {
  const defaultWatchlist = await ensureDefaultWatchlistRecord();
  return listWatchlistMemberRecords(defaultWatchlist.id, enabledOnly);
}

export async function listWatchSymbols(enabledOnly = false): Promise<WatchlistItem[]> {
  const defaultWatchlist = await ensureDefaultWatchlistRecord();
  return listWatchlistMembers(defaultWatchlist.id, enabledOnly);
}

export async function addWatchSymbol(
  symbol: string,
  displayName: string | undefined,
  regionOverride?: string | undefined,
): Promise<WatchlistItem> {
  const defaultWatchlist = await ensureDefaultWatchlistRecord();
  return addSymbolToWatchlist(defaultWatchlist.id, symbol, displayName, regionOverride);
}

export async function moveWatchSymbol(
  symbol: string,
  direction: "up" | "down",
): Promise<boolean> {
  const defaultWatchlist = await ensureDefaultWatchlistRecord();
  return moveWatchlistMember(defaultWatchlist.id, symbol, direction);
}

export async function removeWatchSymbol(symbol: string): Promise<boolean> {
  const defaultWatchlist = await ensureDefaultWatchlistRecord();
  return removeSymbolFromWatchlist(defaultWatchlist.id, symbol);
}

export async function bulkInsertWatchSymbols(symbols: string[]): Promise<void> {
  if (symbols.length === 0) {
    return;
  }

  const defaultWatchlist = await ensureDefaultWatchlistRecord();
  for (const symbol of symbols) {
    await addSymbolToWatchlist(defaultWatchlist.id, symbol, undefined, undefined);
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

export async function getTradeDateBoundsBySymbols(
  symbols: string[],
): Promise<Map<string, TradeDateBounds>> {
  if (symbols.length === 0) {
    return new Map();
  }

  const rows = await prisma.dailyPrice.groupBy({
    by: ["symbol"],
    where: {
      symbol: { in: symbols },
    },
    _min: {
      tradeDate: true,
    },
    _max: {
      tradeDate: true,
    },
  });

  const entries = rows.flatMap((row) => {
    const minTradeDate = row._min.tradeDate;
    const maxTradeDate = row._max.tradeDate;
    if (!minTradeDate || !maxTradeDate) {
      return [];
    }
    return [[row.symbol, { minTradeDate, maxTradeDate }] as const];
  });

  return new Map(entries);
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
